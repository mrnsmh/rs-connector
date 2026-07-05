# rs-connector

**Hub de messagerie multi-canal, indépendant, brancheable sur plusieurs applications.**

rs-connector se connecte à des canaux de messagerie (WhatsApp, Telegram, Email…), **normalise** les
messages entrants et sortants derrière une interface unique, et notifie chaque application
cliente via des **webhooks signés**. Un **back-office sécurisé** (mot de passe + OTP) permet de
configurer les comptes de canal et les applications branchées.

> Service **autonome** : base de données, volumes et réseau dédiés. Il ne partage aucune
> ressource avec les autres services et se branche sur les applications uniquement par HTTP
> (API d'entrée + webhooks). Voir [`PLAN-TACHES.md`](./PLAN-TACHES.md) pour l'architecture détaillée
> et [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) pour brancher une application.

## Fonctionnalités

- **4 canaux** derrière une abstraction d'adaptateur commune :
  | Canal | `channel_type` | Auth | Entrant |
  |---|---|---|---|
  | WhatsApp (non officiel) | `whatsapp_baileys` | QR | socket |
  | WhatsApp Cloud API (Meta) | `whatsapp_cloud` | token + phone_number_id | webhook |
  | Telegram | `telegram` | token bot | long-polling |
  | Email | `email` | SMTP + IMAP | polling IMAP |
- **Multi-app** : chaque application a une clé API (stockée hachée) et reçoit ses webhooks
  signés. **Scoping strict** : une application ne voit et n'agit que sur ses propres connexions.
- **Back-office sécurisé** : mot de passe (scrypt) + **OTP TOTP** (2FA), sessions httpOnly,
  protection CSRF, rate-limit + lockout du login.
- **Credentials chiffrés au repos** (AES-256-GCM, clé injectée hors base).
- **Fiabilité** : outbox de webhooks persistante avec retry/backoff, restauration des
  connexions au démarrage, machine à états des statuts de message.

## Prérequis

- Node.js ≥ 20 (développé/testé sous Node 22)
- PostgreSQL 16 (fourni par `docker-compose`)
- Docker + Docker Compose (pour le déploiement conteneurisé)

## Démarrage rapide (Docker)

```bash
cp .env.example .env
# 1) Générer les secrets
node scripts/generate-key.js          # → CREDENTIALS_ENCRYPTION_KEY
#   éditez .env : DB_PASSWORD, WEBHOOK_SECRET, CREDENTIALS_ENCRYPTION_KEY, WHATSAPP_CLOUD_* ...

# 2) Réseau externe pour les applications clientes (une fois)
docker network create rs-connector-apps

# 3) Démarrer
docker compose up -d --build

# 4) Créer le premier compte admin du back-office
docker compose exec rs-connector node scripts/create-admin.js <identifiant> '<mot-de-passe-fort>'
```

Le service écoute sur `127.0.0.1:3007` (health : `GET /health`).

## Démarrage en développement (local)

```bash
# Backend
npm install
npm test                     # 191 tests
DB_HOST=localhost DB_PASSWORD=... CREDENTIALS_ENCRYPTION_KEY=$(node scripts/generate-key.js) \
  ADMIN_COOKIE_SECURE=false npm start

# Frontend (dans un autre terminal)
cd frontend
npm install
npm run dev                  # http://localhost:5173 (proxy /admin → :3007)
```

## Back-office

Le frontend (`frontend/`, Vite + React) est une application séparée. Parcours :
**login → OTP (si activé) → dashboard**. Depuis le dashboard on peut :

- créer des **applications** (la clé API est affichée **une seule fois**) ;
- créer des **connexions** de canal (choix du canal, application propriétaire, credentials) ;
- activer la **2FA** (TOTP) sur son compte admin.

En production, servez le `dist/` du frontend derrière le même domaine que l'API (le cookie de
session est `SameSite=Strict` + `Secure`).

## API

- **Applications (`/v1`, authentifié par clé API)** — voir [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) :
  - `POST /v1/messages` — envoi sortant `{ channel, to, text }` (`connection_id` optionnel, pour lever une ambiguïté)
  - `GET /v1/connections`, `GET /v1/connections/:id`
- **Webhooks sortants** (rs-connector → application) : `message.received`, `message.status_changed`,
  `session.connected`, `session.disconnected` — signés `X-Webhook-Signature: sha256=<hex>`
  avec le **secret propre à l'application** (révélé à la création, rotation via le back-office ;
  repli sur `WEBHOOK_SECRET` global si l'app n'en a pas).
- **Webhook WhatsApp Cloud** (Meta → rs-connector) : `GET/POST /webhooks/whatsapp-cloud`.
- **Back-office (`/admin`, session + OTP + CSRF)** : `login`, `login/otp`, `logout`, `me`,
  `totp/setup`, `totp/enable` ; provisioning `channels`, `applications` (+ `:id/regenerate-key`,
  `:id/rotate-webhook-secret`, `DELETE :id`), `connections` (+ `:id/qr`, `:id/send`, `DELETE :id`),
  et `info` (URL de base + endpoints détectés). Définissez `PUBLIC_BASE_URL` en production
  (derrière un proxy, la détection automatique ne voit pas l'URL publique).

## Sécurité

- Clés API et tokens de session **stockés hachés** (SHA-256) ; jamais en clair.
- Mot de passe admin haché **scrypt** ; **OTP TOTP** (RFC 6238) ; secret TOTP chiffré au repos.
- Credentials de canal **chiffrés AES-256-GCM** (clé hors base). Sans clé configurée, la
  création de connexions avec secrets est **refusée** (fail-closed).
- Webhooks entrants Meta vérifiés par **signature HMAC** (`X-Hub-Signature-256`) — configurez
  `WHATSAPP_CLOUD_APP_SECRET` en production.
- CSRF (jeton synchroniseur) sur toutes les mutations du back-office ; rate-limit + lockout login.
- `npm audit` : **0 vulnérabilité**.

## Tests

```bash
npm test        # 191 tests (node:test), sans réseau réel (dépendances mockées)
```

## Structure

```
src/
  adapters/         # whatsapp-baileys, whatsapp-cloud, telegram, email (+ registre index.js)
  admin/            # password (scrypt), totp, auth-admin (sessions/CSRF), routes (/admin)
  connection-manager.js / -factory.js   # gestion générique des connexions par channel_type
  crypto-vault.js   # AES-256-GCM (credentials au repos)
  db.js schema.sql  # PostgreSQL dédié
  app.js index.js   # Express + démarrage
scripts/            # create-admin.js, generate-key.js
frontend/           # back-office Vite + React (séparé)
test/               # 178 tests
```

## Points ouverts

Voir la section « Points ouverts » de [`PLAN-TACHES.md`](./PLAN-TACHES.md) (connexions
partageables entre apps, secret webhook par application dans l'outbox, canaux additionnels
Discord/SMS/Teams, support des médias).
