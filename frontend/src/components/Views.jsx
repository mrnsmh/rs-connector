import { Icon } from './Icon.jsx';

// Bloc de code (exemples curl / payloads).
function Code({ children }) {
  return <pre className="codeblock">{children}</pre>;
}

// ─────────────────────────── Documentation ───────────────────────────
export function DocsView() {
  return (
    <>
      <section className="panel doc">
        <h2><Icon name="file" /> Documentation</h2>
        <p className="muted">RS-Connector est une <b>passerelle de messagerie multicanal</b>. Il reçoit les messages entrants (WhatsApp, Telegram, Email) et les distribue à vos applications via un <b>webhook signé</b>, et envoie les messages sortants via une <b>API unique</b> — quel que soit le canal.</p>
      </section>

      <section className="panel doc">
        <h3><Icon name="list" /> Concepts</h3>
        <div className="doc-grid">
          <div className="doc-item">
            <h4><Icon name="package" /> Application</h4>
            <p>Une brique cliente (ex. Desklink, Deskstudio). Possède <b>une clé API</b> (authentification Bearer) et une <b>URL de webhook</b> où elle reçoit ses messages entrants. Une application peut regrouper <b>plusieurs canaux</b>.</p>
          </div>
          <div className="doc-item">
            <h4><Icon name="plug" /> Canal (connexion)</h4>
            <p>Un compte de messagerie concret : un <b>bot Telegram</b>, un <b>numéro WhatsApp</b>, une <b>boîte email</b>. Chaque canal est rattaché à une seule application.</p>
          </div>
          <div className="doc-item">
            <h4><Icon name="check" /> Canal par défaut</h4>
            <p>Une application désigne <b>un seul</b> canal par défaut (★). Il est utilisé pour l'envoi quand l'appel ne précise ni <code className="mono">channel</code> ni <code className="mono">connection_id</code>.</p>
          </div>
        </div>
      </section>

      <section className="panel doc">
        <h3><Icon name="arrow" /> Démarrer en 3 étapes</h3>
        <ol className="doc-steps">
          <li><b>Créer une application</b> — onglet « Applications &amp; canaux » → « + Nouvelle application ». Copiez la <b>clé API</b> et le <b>secret webhook</b> affichés (une seule fois).</li>
          <li><b>Ajouter un canal</b> sous l'application — « + Ajouter un canal » :
            <ul>
              <li><Icon name="chat" /> <b>Telegram</b> : collez le token du bot (@BotFather). Connexion immédiate.</li>
              <li><Icon name="scan" /> <b>WhatsApp</b> : scannez le QR (WhatsApp → Appareils connectés).</li>
              <li><Icon name="mail" /> <b>Email</b> : renseignez SMTP (envoi) et, en option, IMAP (réception).</li>
            </ul>
          </li>
          <li><b>Définir le canal par défaut</b> (option) puis envoyer via l'API (voir l'onglet Développeurs).</li>
        </ol>
      </section>

      <section className="panel doc">
        <h3><Icon name="globe" /> Canaux supportés</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Canal</th><th>Connexion</th><th>Entrant</th></tr></thead>
          <tbody>
            <tr><td><Icon name="chat" /> Telegram</td><td>Token de bot (@BotFather)</td><td>Long polling (aucune URL publique requise)</td></tr>
            <tr><td><Icon name="scan" /> WhatsApp · Baileys</td><td>Appairage par QR code</td><td>Session WhatsApp Web</td></tr>
            <tr><td><Icon name="package" /> WhatsApp Cloud</td><td>Token Graph + Phone Number ID</td><td>Webhook Meta</td></tr>
            <tr><td><Icon name="mail" /> Email</td><td>SMTP / IMAP</td><td>Relève IMAP</td></tr>
          </tbody>
        </table></div>
      </section>
    </>
  );
}

// ─────────────────────────── FAQ ───────────────────────────
const FAQ = [
  { q: 'Pourquoi faut-il un bot Telegram par application ?', a: 'Un bot Telegram ne peut être « écouté » que par un seul consommateur à la fois (long polling exclusif). Deux applications sur le même bot se voleraient les messages. Chaque produit a donc son propre bot — comme chaque produit a son propre numéro WhatsApp.' },
  { q: 'Comment connecter Telegram ?', a: 'Créez un bot via @BotFather (/newbot), récupérez le token, puis « + Ajouter un canal » → Telegram → collez le token. La connexion est immédiate (validation getMe). Aucun webhook à déclarer côté Telegram : rs-connector récupère les messages par long polling.' },
  { q: 'Comment connecter WhatsApp ?', a: '« + Ajouter un canal » → WhatsApp · Baileys → la carte affiche un QR. Sur le téléphone : WhatsApp → Appareils connectés → Connecter un appareil, puis scannez. Le statut passe à « connected » automatiquement.' },
  { q: 'Que se passe-t-il si je supprime une application ?', a: 'Tous ses canaux sont supprimés avec elle (les sessions sont coupées). L’action est irréversible — une confirmation est demandée.' },
  { q: 'Comment changer le canal par défaut ?', a: 'Bouton « Définir par défaut » sur un canal. Il n’y a qu’un seul canal par défaut par application : définir un nouveau remplace l’ancien.' },
  { q: 'Les connexions se reconnectent-elles après un redémarrage ?', a: 'Oui. Les canaux au statut « connected » sont restaurés automatiquement au démarrage du service, sans intervention.' },
  { q: 'Combien de clés API par application ?', a: 'Une seule. La régénérer (menu ⋯ de l’application) révoque immédiatement l’ancienne — pensez à mettre à jour vos backends.' },
  { q: 'Puis-je déplacer un canal d’une application à une autre ?', a: 'Oui, bouton « Déplacer » sur le canal. C’est une mise à jour en base uniquement : la session live n’est pas coupée.' },
];

export function FaqView() {
  return (
    <section className="panel doc">
      <h2><Icon name="support" /> FAQ</h2>
      <div className="faq">
        {FAQ.map((item, i) => (
          <details key={i} className="faq-item">
            <summary>{item.q}</summary>
            <p className="muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────── Développeurs ───────────────────────────
export function DevView({ info }) {
  const base = (info && info.baseUrl) || 'https://rsconnect.aiflowhub.online';
  return (
    <>
      <section className="panel doc">
        <h2><Icon name="globe" /> Développeurs — API &amp; webhooks</h2>
        <p className="muted">Base : <code className="mono">{base}</code>. Toutes les requêtes s’authentifient avec la clé API de l’application.</p>
        <h4><Icon name="lock" /> Authentification</h4>
        <Code>{`Authorization: Bearer <clé_API_de_l'application>`}</Code>
      </section>

      <section className="panel doc">
        <h3><Icon name="arrow" /> Envoyer un message</h3>
        <p className="muted"><code className="mono">POST /v1/messages</code> — si vous omettez <code className="mono">channel</code> et <code className="mono">connection_id</code>, le <b>canal par défaut</b> de l’application est utilisé.</p>
        <Code>{`curl -X POST ${base}/v1/messages \\
  -H "Authorization: Bearer <clé_API>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "connection_id": "ds-tg",   // ou "channel": "telegram" ; ou rien → canal par défaut
    "to": "<chat_id / numéro / email>",
    "text": "Bonjour depuis rs-connector"
  }'`}</Code>
      </section>

      <section className="panel doc">
        <h3><Icon name="inbox" /> Lister ses canaux</h3>
        <Code>{`curl ${base}/v1/connections \\
  -H "Authorization: Bearer <clé_API>"`}</Code>
      </section>

      <section className="panel doc">
        <h3><Icon name="plug" /> Connecter un canal (self-service)</h3>
        <p className="muted"><code className="mono">POST /v1/connections</code> — enregistre et connecte un canal avec la seule clé API de l’application (les credentials sont chiffrés au repos). Réponses : <code className="mono">201</code> créé, <code className="mono">409</code> identifiant déjà pris par une autre app, <code className="mono">502</code> échec de connexion (token invalide…).</p>
        <Code>{`curl -X POST ${base}/v1/connections \\
  -H "Authorization: Bearer <clé_API>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "connectionId": "ds-tg",
    "channelType": "telegram",
    "credentials": { "token": "123456:ABC-DEF..." }
  }'
# → { "connectionId":"ds-tg", "state":{ "status":"connected", "username":"mon_bot" } }`}</Code>
      </section>

      <section className="panel doc">
        <h3><Icon name="shield" /> Webhooks entrants (signés)</h3>
        <p className="muted">Pour chaque événement (message entrant, accusé de statut, connexion/déconnexion), rs-connector envoie un <code className="mono">POST</code> au <b>webhook de l’application</b>. Le corps est signé dans l’en-tête <code className="mono">X-Webhook-Signature</code> (HMAC-SHA256 du corps brut avec le <b>secret webhook</b> de l’application). Vérifiez-la avant de traiter :</p>
        <Code>{`// Node.js — vérification de signature
import crypto from 'crypto';
const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
  .update(rawBody).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
  return res.status(401).end();  // signature invalide → rejeter
}`}</Code>
        <p className="muted">Une <b>outbox persistante</b> garantit qu’aucun événement n’est perdu : en cas d’indisponibilité de votre webhook, rs-connector réessaie avec backoff.</p>
      </section>
    </>
  );
}
