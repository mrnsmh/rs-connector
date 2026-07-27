"""API Admin pour le frontend React — routes /admin/*.

Le frontend React appelle ces endpoints en JSON (pas DRF).
La session est portée par un cookie httpOnly + CSRF token.
"""
import hashlib
import json
import os
import secrets
import time

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.urls import reverse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt

from .models import ApiKey, Connection, Organisation, Profile
from .api_keys import hash_api_key


def _json_error(message, status=400):
    return JsonResponse({"error": message}, status=status)


def _parse_body(request):
    try:
        return json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return {}


# ── Auth ──────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_POST
def admin_login(request):
    """POST /admin/login — Login admin (username/email + password)."""
    data = _parse_body(request)
    username = data.get("username", "")
    password = data.get("password", "")

    if not username or not password:
        return _json_error("Username and password required")

    user = authenticate(request, username=username, password=password)
    if user is None:
        return _json_error("Invalid credentials", 401)

    login(request, user)
    return JsonResponse({
        "csrfToken": get_token(request),
        "otpRequired": False,
        "otpVerified": True,
    })


@csrf_exempt
@require_POST
def admin_otp(request):
    """POST /admin/login/otp — OTP verification (pas implémenté, toujours OK)."""
    return JsonResponse({
        "csrfToken": get_token(request),
        "otpVerified": True,
    })


@require_POST
def admin_logout(request):
    """POST /admin/logout."""
    logout(request)
    return JsonResponse({"ok": True})


@ensure_csrf_cookie
@require_GET
def admin_me(request):
    """GET /admin/me — Retourne l'utilisateur courant + csrf token."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    return JsonResponse({
        "email": request.user.email,
        "username": request.user.email,  # frontend utilise m.username
        "is_staff": request.user.is_staff,
        "csrfToken": get_token(request),
    })


# ── Channels ──────────────────────────────────────────────────────────────────

@require_GET
def admin_channels(request):
    """GET /admin/channels — Liste des types de canaux disponibles."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    channels = [
        {"id": c[0], "label": c[1]}
        for c in Connection.Channel.choices
    ]
    return JsonResponse({"channels": channels})


# ── Applications (→ Profils) ──────────────────────────────────────────────────

def _get_api_key_prefix(profile):
    """Retourne le prefix de la clé API active de ce profil."""
    key = ApiKey.objects.filter(profile=profile, revoked_at__isnull=True).first()
    return key.prefix if key else ""


def _get_default_connection_id(profile):
    """Retourne l'ID de la connexion par défaut de ce profil (via meta.isDefault)."""
    conn = Connection.objects.filter(profile=profile, meta__isDefault=True).first()
    return conn.connection_id if conn else None


def _serialize_profile(profile):
    """Serialize un profil au format attendu par le frontend Dashboard.jsx."""
    return {
        "id": str(profile.id),
        "name": profile.name,
        "api_key_prefix": _get_api_key_prefix(profile),
        "webhook_url": profile.webhook_url or "",
        "webhook_secret": profile.webhook_secret[:8] + "..." if profile.webhook_secret else "",
        "isActive": profile.is_active,
        "default_connection_id": _get_default_connection_id(profile),
        "createdAt": profile.created_at.isoformat() if profile.created_at else None,
    }


@require_GET
def admin_applications(request):
    """GET /admin/applications — Liste des applications (profils)."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    profiles = Profile.objects.select_related("organisation").all()
    return JsonResponse({
        "applications": [_serialize_profile(p) for p in profiles],
    })


@require_POST
def admin_applications_create(request):
    """POST /admin/applications — Créer une application (profil)."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    data = _parse_body(request)
    name = data.get("name", "").strip()
    webhook_url = data.get("webhookUrl", "").strip() or data.get("webhook_url", "").strip()
    if not name:
        return _json_error("Name required")

    org, _ = Organisation.objects.get_or_create(
        name=request.user.email,
        defaults={"owner": request.user},
    )
    profile = Profile.objects.create(
        organisation=org,
        name=name,
        webhook_url=webhook_url,
    )

    # Generate API key
    raw_key = f"rs_{secrets.token_hex(24)}"
    key_hash = hash_api_key(raw_key)
    prefix = raw_key[:12]
    ApiKey.objects.create(
        profile=profile,
        label="default",
        prefix=prefix,
        key_hash=key_hash,
    )

    return JsonResponse({
        "id": str(profile.id),
        "name": profile.name,
        "apiKey": raw_key,
        "api_key_prefix": prefix,
        "webhook_url": profile.webhook_url,
        "webhookSecret": profile.webhook_secret,
        "webhook_secret": profile.webhook_secret,
    }, status=201)


@require_POST
def admin_applications_regenerate_key(request, app_id):
    """POST /admin/applications/:id/regenerate-key — Régénérer la clé API."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    try:
        profile = Profile.objects.get(id=app_id)
    except Profile.DoesNotExist:
        return _json_error("Application not found", 404)

    # Revoke old keys
    from django.utils import timezone
    ApiKey.objects.filter(profile=profile, revoked_at__isnull=True).update(revoked_at=timezone.now())

    # Generate new key
    raw_key = f"rs_{secrets.token_hex(24)}"
    key_hash = hash_api_key(raw_key)
    prefix = raw_key[:12]
    ApiKey.objects.create(
        profile=profile,
        label="regenerated",
        prefix=prefix,
        key_hash=key_hash,
    )

    return JsonResponse({"apiKey": raw_key, "api_key_prefix": prefix})


@require_POST
def admin_applications_rotate_webhook(request, app_id):
    """POST /admin/applications/:id/rotate-webhook-secret — Tourner le secret webhook."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    try:
        profile = Profile.objects.get(id=app_id)
    except Profile.DoesNotExist:
        return _json_error("Application not found", 404)

    profile.webhook_secret = secrets.token_hex(32)
    profile.save(update_fields=["webhook_secret"])

    return JsonResponse({
        "webhookSecret": profile.webhook_secret,
        "webhook_secret": profile.webhook_secret,
    })


@require_POST
def admin_applications_delete(request, app_id):
    """DELETE /admin/applications/:id — Supprimer une application."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    try:
        profile = Profile.objects.get(id=app_id)
    except Profile.DoesNotExist:
        return _json_error("Application not found", 404)

    profile.delete()
    return JsonResponse({"ok": True})


# ── Connections ───────────────────────────────────────────────────────────────

def _serialize_connection(conn):
    """Serialize une connexion au format attendu par le frontend Dashboard.jsx."""
    return {
        "id": str(conn.id),
        "connectionId": conn.connection_id,
        "channelType": conn.channel_type,
        "applicationId": str(conn.profile_id),  # frontend attend applicationId, pas profileId
        "profileId": str(conn.profile_id),
        "profileName": conn.profile.name if conn.profile else None,
        "webhookUrl": conn.webhook_url or None,
        "webhook_url": conn.webhook_url or None,
        # frontend attend c.state.status (objet imbriqué), pas c.status plat
        "state": {"status": conn.status},
        "status": conn.status,  # fallback
        "meta": conn.meta,
        "createdAt": conn.created_at.isoformat() if conn.created_at else None,
    }


@require_GET
def admin_connections(request):
    """GET /admin/connections — Liste des connexions.

    Le frontend Dashboard lit cx.connexions (clé en français).
    """
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    conns = Connection.objects.select_related("profile").all()
    serialized = [_serialize_connection(c) for c in conns]
    return JsonResponse({
        "connexions": serialized,   # frontend: setConnections(cx.connexions || [])
        "connections": serialized,  # fallback camelCase
    })


@require_POST
def admin_connections_create(request):
    """POST /admin/connections — Créer une connexion."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    data = _parse_body(request)
    profile_id = data.get("applicationId") or data.get("profileId")
    channel_type = data.get("channelType", "")
    connection_id = data.get("connectionId", "")
    webhook_url = data.get("webhookUrl", "") or data.get("webhook_url", "")
    credentials = data.get("credentials")

    if not profile_id or not channel_type:
        return _json_error("applicationId and channelType required")

    try:
        profile = Profile.objects.get(id=profile_id)
    except Profile.DoesNotExist:
        return _json_error("Application not found", 404)

    conn = Connection.objects.create(
        profile=profile,
        connection_id=connection_id or f"{channel_type}-{secrets.token_hex(4)}",
        channel_type=channel_type,
        webhook_url=webhook_url,
    )

    return JsonResponse(_serialize_connection(conn), status=201)


@require_POST
def admin_connections_qr(request, conn_id):
    """GET /admin/connections/:id/qr — QR code (placeholder)."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    try:
        conn = Connection.objects.get(id=conn_id)
    except Connection.DoesNotExist:
        return _json_error("Connection not found", 404)

    # TODO: wire to worker Baileys via worker_client
    return _json_error("QR code generation not yet wired to worker", 501)


@require_POST
def admin_connections_send(request, conn_id):
    """POST /admin/connections/:id/send — Envoyer un message test."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    data = _parse_body(request)
    to = data.get("to", "")
    text = data.get("text", "")

    if not to or not text:
        return _json_error("to and text required")

    # TODO: wire to worker Baileys via worker_client
    return _json_error("Message sending not yet wired to worker", 501)


@require_POST
def admin_connections_set_default(request, conn_id):
    """POST /admin/connections/:id/default — Définir comme connexion par défaut."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    try:
        conn = Connection.objects.get(id=conn_id)
    except Connection.DoesNotExist:
        return _json_error("Connection not found", 404)

    if not conn.profile_id:
        return _json_error("no_application", 400)

    # Retirer isDefault des autres canaux du même profil
    Connection.objects.filter(profile_id=conn.profile_id, meta__isDefault=True).update(meta={"isDefault": False})
    conn.meta["isDefault"] = True
    conn.save(update_fields=["meta"])

    return JsonResponse({"ok": True})


@require_POST
def admin_connections_unset_default(request, conn_id):
    """DELETE /admin/connections/:id/default — Retirer le statut par défaut."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    try:
        conn = Connection.objects.get(id=conn_id)
    except Connection.DoesNotExist:
        return _json_error("Connection not found", 404)

    conn.meta.pop("isDefault", None)
    conn.save(update_fields=["meta"])

    return JsonResponse({"ok": True})


@require_POST
def admin_connections_set_application(request, conn_id):
    """POST /admin/connections/:id/application — Réaffecter une connexion."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    data = _parse_body(request)
    application_id = data.get("applicationId")

    try:
        conn = Connection.objects.get(id=conn_id)
    except Connection.DoesNotExist:
        return _json_error("Connection not found", 404)

    if application_id:
        try:
            profile = Profile.objects.get(id=application_id)
        except Profile.DoesNotExist:
            return _json_error("Application not found", 404)
        conn.profile = profile
    else:
        return _json_error("applicationId required")

    conn.save(update_fields=["profile_id"])
    return JsonResponse({"ok": True})


@require_POST
def admin_connections_delete(request, conn_id):
    """DELETE /admin/connections/:id — Supprimer une connexion."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    try:
        conn = Connection.objects.get(id=conn_id)
    except Connection.DoesNotExist:
        return _json_error("Connection not found", 404)

    conn.delete()
    return JsonResponse({"ok": True})


# ── Info ──────────────────────────────────────────────────────────────────────

@require_GET
def admin_info(request):
    """GET /admin/info — Infos sur le serveur RS-Connector.

    Le frontend Dashboard lit info.baseUrl, info.endpoints.*, info.auth, info.detected.
    """
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)

    base_url = getattr(settings, "PUBLIC_BASE_URL", "https://rsconnect.aiflowhub.online")
    return JsonResponse({
        "service": "rs-connector-django",
        "version": "2.0",
        "channels": [c[0] for c in Connection.Channel.choices],
        "totalConnections": Connection.objects.count(),
        "totalApplications": Profile.objects.count(),
        # Champs attendus par le frontend DevView
        "baseUrl": base_url,
        "detected": not bool(getattr(settings, "PUBLIC_BASE_URL", None)),
        "endpoints": {
            "sendMessage": "/v1/messages",
            "listConnections": "/v1/connections",
            "whatsappCloudWebhook": "/v1/webhooks/whatsapp-cloud",
        },
        "auth": "Bearer token (clé API de l'application)",
    })


# ── TOTP (placeholder) ───────────────────────────────────────────────────────

@require_POST
def admin_totp_setup(request):
    """POST /admin/totp/setup — Setup TOTP (placeholder)."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)

    import base64, urllib.parse
    secret = secrets.token_base32(20).decode() if hasattr(secrets, 'token_base32') else secrets.token_hex(20).upper()[:32]
    otpauth_uri = f"otpauth://totp/RS-Connector:{urllib.parse.quote(request.user.email or request.user.username)}?secret={secret}&issuer=RS-Connector&algorithm=SHA1&digits=6&period=30"
    return JsonResponse({"secret": secret, "otpauthUri": otpauth_uri, "qrUrl": otpauth_uri})


@require_POST
def admin_totp_enable(request):
    """POST /admin/totp/enable — Activer TOTP (placeholder)."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    return JsonResponse({"ok": True})


@require_POST
def admin_change_password(request):
    """POST /admin/change-password — Changer le mot de passe."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    data = _parse_body(request)
    current = data.get("currentPassword", "")
    new = data.get("newPassword", "")

    if not current or not new:
        return _json_error("currentPassword and newPassword required")

    if not request.user.check_password(current):
        return _json_error("invalid_current_password", 401)

    if len(new) < 10:
        return _json_error("weak_password", 400)

    request.user.set_password(new)
    request.user.save()
    return JsonResponse({"ok": True})


@csrf_exempt
@require_POST
def google_login(request):
    """POST /admin/google — Google OAuth login (ID token)."""
    from django.contrib.auth.models import User
    from .models import UserProfile
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    
    data = _parse_body(request)
    credential = data.get("credential", "")
    
    if not credential:
        return _json_error("Credential Google requis", 400)
    
    # Vérifier le token Google
    try:
        client_id = data.get("client_id", "")
        if not client_id:
            return _json_error("Client ID Google requis", 400)
        
        idinfo = id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
        
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            return _json_error("Token Google invalide", 400)
        
        google_id = idinfo['sub']
        email = idinfo.get('email', '')
        first_name = idinfo.get('given_name', '')
        last_name = idinfo.get('family_name', '')
        
        if not email:
            return _json_error("Email non fourni par Google", 400)
        
    except ValueError as e:
        return _json_error(f"Token Google invalide: {e}", 400)
    
    # Chercher ou créer l'utilisateur
    try:
        profile = UserProfile.objects.get(google_id=google_id)
        user = profile.user
    except UserProfile.DoesNotExist:
        # Chercher par email
        try:
            user = User.objects.get(email=email)
            # Lier le profil Google
            UserProfile.objects.create(user=user, google_id=google_id)
        except User.DoesNotExist:
            # Créer un nouveau compte admin
            username = email.split('@')[0]
            user = User.objects.create_user(
                username=username,
                email=email,
                first_name=first_name,
                last_name=last_name,
                is_staff=True,
                is_superuser=True
            )
            UserProfile.objects.create(user=user, google_id=google_id)
    
    if not user.is_active:
        return _json_error("Compte désactivé", 403)
    
    login(request, user)
    return JsonResponse({
        "csrfToken": get_token(request),
        "otpRequired": False,
        "otpVerified": True,
    })
