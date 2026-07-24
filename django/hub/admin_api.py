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

def _serialize_profile(profile):
    return {
        "id": str(profile.id),
        "name": profile.name,
        "webhookUrl": profile.webhook_url,
        "webhookSecret": profile.webhook_secret[:8] + "..." if profile.webhook_secret else "",
        "isActive": profile.is_active,
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
    webhook_url = data.get("webhookUrl", "").strip()
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

    return JsonResponse({"apiKey": raw_key})


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

    return JsonResponse({"webhookSecret": profile.webhook_secret[:8] + "..."})


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
    return {
        "id": str(conn.id),
        "connectionId": conn.connection_id,
        "channelType": conn.channel_type,
        "status": conn.status,
        "webhookUrl": conn.webhook_url or None,
        "profileId": str(conn.profile_id),
        "profileName": conn.profile.name if conn.profile else None,
        "meta": conn.meta,
        "createdAt": conn.created_at.isoformat() if conn.created_at else None,
    }


@require_GET
def admin_connections(request):
    """GET /admin/connections — Liste des connexions."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    conns = Connection.objects.select_related("profile").all()
    return JsonResponse({
        "connections": [_serialize_connection(c) for c in conns],
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

    # Placeholder — le QR sera généré par le worker Baileys
    return JsonResponse({"qr": "pending", "status": conn.status})


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

    # Placeholder — l'envoi sera fait par le worker
    return JsonResponse({"ok": True, "message": "Test message queued"})


@require_POST
def admin_connections_set_default(request, conn_id):
    """POST /admin/connections/:id/default — Définir comme connexion par défaut."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    try:
        conn = Connection.objects.get(id=conn_id)
    except Connection.DoesNotExist:
        return _json_error("Connection not found", 404)

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
    """GET /admin/info — Infos sur le serveur RS-Connector."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    return JsonResponse({
        "service": "rs-connector-django",
        "version": "2.0",
        "channels": [c[0] for c in Connection.Channel.choices],
        "totalConnections": Connection.objects.count(),
        "totalApplications": Profile.objects.count(),
    })


# ── TOTP (placeholder) ───────────────────────────────────────────────────────

@require_POST
def admin_totp_setup(request):
    """POST /admin/totp/setup — Setup TOTP (placeholder)."""
    if not request.user.is_authenticated:
        return _json_error("Not authenticated", 401)
    return JsonResponse({"secret": secrets.token_hex(20), "qrUrl": "placeholder"})


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

    if not request.user.check_password(current):
        return _json_error("Current password incorrect", 401)

    request.user.set_password(new)
    request.user.save()
    return JsonResponse({"ok": True})
