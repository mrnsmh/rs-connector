'use strict';

/**
 * Routeur du back-office sécurisé (Task 9 + provisioning Task 11), monté sur /admin.
 * Flux d'auth : login (mot de passe, rate-limit + lockout) → OTP TOTP (si activé) → session
 * (cookie httpOnly). Routes protégées : session OTP-vérifiée + jeton CSRF sur les mutations.
 *
 * Provisioning (protégé) : gestion des applications (clé API révélée une seule fois) et des
 * connexions de canal (credentials chiffrés au repos via le coffre AES-GCM injecté).
 *
 * Le secret TOTP est chiffré au repos quand un coffre est fourni (détection par préfixe
 * `gcm1.` en lecture, pour rester compatible avec un secret stocké en clair sans coffre).
 */

const crypto = require('node:crypto');
const express = require('express');
const logger = require('../logger');
const { verifyPassword } = require('./password');
const { generateSecret, verifyTotp, getOtpauthUri } = require('./totp');
const { generateApiKey } = require('../api-key');
const {
  hashToken,
  buildSessionCookie,
  clearSessionCookie,
  loadAdminSession,
  createRequireAdmin,
} = require('./auth-admin');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function createAdminRouter({ db, admin = {}, vault = null, connectionManager = null, adapterRegistry = null, publicBaseUrl = '' } = {}) {
  const router = express.Router();
  const issuer = admin.issuer || 'deskrs';
  const sessionTtlSeconds = admin.sessionTtlSeconds || 12 * 3600;
  const cookieSecure = admin.cookieSecure !== false;
  const requireAdmin = createRequireAdmin(db);

  const newToken = () => crypto.randomBytes(32).toString('base64url');
  // Chiffrement du secret TOTP au repos si un coffre est configuré (sinon clair, compat tests/dev).
  const encryptSecret = (s) => (vault ? vault.encrypt(s) : s);
  const readSecret = (s) => (vault && typeof s === 'string' && s.startsWith('gcm1.') ? vault.decrypt(s) : s);

  // ==================== Authentification ====================

  router.post('/login', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'db_unavailable' });
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
    try {
      const attempt = await db.getLoginAttempt(username);
      if (attempt && attempt.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) {
        return res.status(429).json({ error: 'locked', message: 'Trop de tentatives, réessayez plus tard' });
      }
      const user = await db.getAdminUserByUsername(username);
      const ok = !!user && verifyPassword(password, user.password_hash);
      if (!ok) {
        const failedCount = (attempt ? attempt.failed_count : 0) + 1;
        const lockedUntil = failedCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
        await db.recordFailedLogin(username, { failedCount, lockedUntil });
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      await db.resetLoginAttempts(username);

      const token = newToken();
      const csrfToken = newToken();
      const otpVerified = !user.totp_enabled;
      await db.createAdminSession({
        tokenHash: hashToken(token),
        adminUserId: user.id,
        csrfToken,
        otpVerified,
        expiresAt: new Date(Date.now() + sessionTtlSeconds * 1000),
      });
      res.setHeader('Set-Cookie', buildSessionCookie(token, { maxAgeSeconds: sessionTtlSeconds, secure: cookieSecure }));
      return res.status(200).json({ otpRequired: !!user.totp_enabled, otpVerified, csrfToken });
    } catch (err) {
      logger.error({ err: err.message }, 'Erreur login back-office');
      return res.status(500).json({ error: 'internal' });
    }
  });

  router.post('/login/otp', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'db_unavailable' });
    const { code } = req.body || {};
    try {
      const session = await loadAdminSession(db, req);
      if (!session) return res.status(401).json({ error: 'unauthorized' });
      if (session.otp_verified) return res.status(200).json({ ok: true, csrfToken: session.csrf_token });
      const user = await db.getAdminUserById(session.admin_user_id);
      if (!user || !user.totp_enabled || !user.totp_secret) return res.status(400).json({ error: 'otp_not_configured' });
      if (!verifyTotp(readSecret(user.totp_secret), code)) return res.status(401).json({ error: 'invalid_otp' });
      await db.markAdminSessionOtpVerified(session.id);
      return res.status(200).json({ ok: true, csrfToken: session.csrf_token });
    } catch (err) {
      logger.error({ err: err.message }, 'Erreur OTP back-office');
      return res.status(500).json({ error: 'internal' });
    }
  });

  router.post('/logout', async (req, res) => {
    try {
      const session = await loadAdminSession(db, req);
      if (session) await db.deleteAdminSession(session.id);
    } catch { /* best effort */ }
    res.setHeader('Set-Cookie', clearSessionCookie({ secure: cookieSecure }));
    return res.status(200).json({ ok: true });
  });

  router.get('/me', requireAdmin, (req, res) => res.status(200).json({
    username: req.adminUser.username,
    totpEnabled: req.adminUser.totp_enabled,
  }));

  router.post('/totp/setup', requireAdmin, async (req, res) => {
    try {
      const secret = generateSecret();
      await db.setAdminTotp(req.adminUser.id, { totpSecret: encryptSecret(secret), totpEnabled: false });
      return res.status(200).json({ secret, otpauthUri: getOtpauthUri(secret, req.adminUser.username, issuer) });
    } catch (err) {
      logger.error({ err: err.message }, 'Erreur TOTP setup');
      return res.status(500).json({ error: 'internal' });
    }
  });

  router.post('/totp/enable', requireAdmin, async (req, res) => {
    const { code } = req.body || {};
    try {
      const user = await db.getAdminUserById(req.adminUser.id);
      if (!user || !user.totp_secret) return res.status(400).json({ error: 'no_secret' });
      if (!verifyTotp(readSecret(user.totp_secret), code)) return res.status(401).json({ error: 'invalid_otp' });
      await db.setAdminTotp(user.id, { totpSecret: user.totp_secret, totpEnabled: true });
      return res.status(200).json({ ok: true });
    } catch (err) {
      logger.error({ err: err.message }, 'Erreur TOTP enable');
      return res.status(500).json({ error: 'internal' });
    }
  });

  // ==================== Provisioning ====================

  // Canaux disponibles (pour le dashboard : liste + capacités).
  router.get('/channels', requireAdmin, (req, res) => {
    const types = adapterRegistry ? adapterRegistry.listChannelTypes() : [];
    const channels = types.map((t) => {
      const a = adapterRegistry.getAdapter(t);
      return { channelType: t, capabilities: a ? a.capabilities : null };
    });
    return res.status(200).json({ channels });
  });

  // Point d'intégration : URL de base détectée + endpoints à utiliser par les applications.
  // `PUBLIC_BASE_URL` prime ; sinon on déduit de la requête (à fixer en prod derrière proxy).
  router.get('/info', requireAdmin, (req, res) => {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = req.headers['x-forwarded-host'] || req.get('host') || '';
    const baseUrl = String(publicBaseUrl || `${proto}://${host}`).replace(/\/+$/, '');
    return res.status(200).json({
      baseUrl,
      detected: !publicBaseUrl,
      endpoints: {
        sendMessage: `${baseUrl}/v1/messages`,
        listConnections: `${baseUrl}/v1/connections`,
        whatsappCloudWebhook: `${baseUrl}/webhooks/whatsapp-cloud`,
      },
      auth: 'Authorization: Bearer <clé_API>',
    });
  });

  // Régénération de la clé API d'une application (révoque l'ancienne, révèle la nouvelle une fois).
  router.post('/applications/:id/regenerate-key', requireAdmin, async (req, res) => {
    try {
      const { apiKey, prefix, hash } = generateApiKey();
      const updated = await db.updateApplicationApiKey(req.params.id, { apiKeyHash: hash, apiKeyPrefix: prefix });
      if (!updated) return res.status(404).json({ error: 'application_not_found' });
      return res.status(200).json({ id: updated.id, name: updated.name, apiKey, apiKeyPrefix: prefix });
    } catch (err) {
      logger.error({ err: err.message, id: req.params.id }, 'Erreur régénération clé API');
      return res.status(500).json({ error: 'internal' });
    }
  });

  // Applications : liste + création (clé API révélée UNE seule fois).
  router.get('/applications', requireAdmin, async (req, res) => {
    try {
      return res.status(200).json({ applications: await db.listApplications() });
    } catch (err) {
      logger.error({ err: err.message }, 'Erreur liste applications');
      return res.status(500).json({ error: 'internal' });
    }
  });

  router.post('/applications', requireAdmin, async (req, res) => {
    const { name, webhookUrl = null } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name requis' });
    try {
      const { apiKey, prefix, hash } = generateApiKey();
      const app = await db.createApplication({ name, apiKeyHash: hash, apiKeyPrefix: prefix, webhookUrl });
      // apiKey n'est renvoyée qu'ici, une seule fois (jamais stockée en clair).
      return res.status(201).json({ id: app.id, name: app.name, apiKey, apiKeyPrefix: prefix, webhookUrl: app.webhook_url });
    } catch (err) {
      logger.error({ err: err.message }, 'Erreur création application');
      return res.status(500).json({ error: 'internal' });
    }
  });

  // Connexions : liste + création (credentials chiffrés au repos).
  router.get('/connections', requireAdmin, async (req, res) => {
    try {
      const rows = await db.listConnections();
      const live = connectionManager ? connectionManager.getAllStates() : {};
      const connexions = rows.map((r) => ({
        connectionId: r.connection_id,
        channelType: r.channel_type,
        applicationId: r.application_id,
        status: r.status,
        hasCredentials: !!r.credentials_encrypted,
        state: live[r.connection_id] || null,
      }));
      return res.status(200).json({ connexions });
    } catch (err) {
      logger.error({ err: err.message }, 'Erreur liste connexions');
      return res.status(500).json({ error: 'internal' });
    }
  });

  router.post('/connections', requireAdmin, async (req, res) => {
    const { connectionId, channelType, applicationId = null, credentials = null, webhookUrl = null } = req.body || {};
    if (!connectionId || !channelType) return res.status(400).json({ error: 'connectionId et channelType requis' });
    if (adapterRegistry && !adapterRegistry.getAdapter(channelType)) {
      return res.status(400).json({ error: 'unknown_channel_type' });
    }
    // Chiffrement des credentials — fail-closed : refuse de stocker des secrets sans coffre.
    let credentialsEncrypted;
    if (credentials && Object.keys(credentials).length > 0) {
      if (!vault) {
        return res.status(400).json({ error: 'encryption_not_configured', message: 'CREDENTIALS_ENCRYPTION_KEY requis pour stocker des credentials' });
      }
      credentialsEncrypted = vault.encryptJson(credentials);
    }
    try {
      await db.upsertConnection({ connectionId, channelType, applicationId, webhookUrl, credentialsEncrypted, status: 'initializing' });
      let state = null;
      if (connectionManager) {
        const adapter = await connectionManager.getOrCreate(connectionId, { channelType, credentials: credentials || undefined });
        if (adapter && typeof adapter.connect === 'function') await adapter.connect();
        state = adapter && typeof adapter.getState === 'function' ? adapter.getState() : null;
      }
      return res.status(201).json({ connectionId, channelType, applicationId, state });
    } catch (err) {
      logger.error({ err: err.message, connectionId }, 'Erreur création connexion');
      return res.status(500).json({ error: 'internal' });
    }
  });

  // État/QR live d'une connexion (utile pour l'appairage WhatsApp).
  router.get('/connections/:connectionId/qr', requireAdmin, (req, res) => {
    if (!connectionManager) return res.status(503).json({ error: 'connection_manager_unavailable' });
    const adapter = connectionManager.get(req.params.connectionId);
    if (!adapter) return res.status(404).json({ error: 'connection_not_active' });
    return res.status(200).json(adapter.getState());
  });

  // Envoi de TEST depuis le back-office : envoie un message via la session live d'une
  // connexion (pour vérifier un canal après appairage). CSRF appliqué par requireAdmin.
  router.post('/connections/:connectionId/send', requireAdmin, async (req, res) => {
    if (!connectionManager) return res.status(503).json({ error: 'connection_manager_unavailable' });
    const { to, text } = req.body || {};
    if (!to || !text) return res.status(400).json({ error: 'missing_fields', message: 'to et text requis' });
    const adapter = connectionManager.get(req.params.connectionId);
    if (!adapter || typeof adapter.sendMessage !== 'function') {
      return res.status(409).json({ error: 'connection_not_active' });
    }
    try {
      const result = await adapter.sendMessage(to, text);
      return res.status(200).json({ ok: true, result });
    } catch (err) {
      logger.error({ err: err.message, connectionId: req.params.connectionId }, 'Erreur envoi de test (admin)');
      return res.status(500).json({ error: 'send_failed', message: err.message });
    }
  });

  return router;
}

module.exports = { createAdminRouter, MAX_FAILED_ATTEMPTS, LOCK_MINUTES };
