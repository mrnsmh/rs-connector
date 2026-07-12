import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api';
import Logo from './Logo.jsx';
import { Icon, IconSprite } from './Icon.jsx';
import { DocsView, FaqView, DevView } from './Views.jsx';

const CHANNEL_LABELS = {
  whatsapp_baileys: 'WhatsApp · Baileys (QR)',
  whatsapp_cloud: 'WhatsApp Cloud · Meta',
  telegram: 'Telegram',
  email: 'Email · SMTP/IMAP',
};
const label = (t) => CHANNEL_LABELS[t] || t;
const CHANNEL_ICONS = { whatsapp_baileys: 'scan', whatsapp_cloud: 'package', telegram: 'chat', email: 'mail' };

// Construit l'objet credentials attendu par l'adaptateur, à partir de champs simples.
function buildCreds(channel, c) {
  if (channel === 'telegram') return c.token ? { token: c.token.trim() } : null;
  if (channel === 'whatsapp_cloud') {
    return c.token || c.phoneNumberId ? { token: (c.token || '').trim(), phoneNumberId: (c.phoneNumberId || '').trim() } : null;
  }
  if (channel === 'email') {
    const smtp = c.smtp || {}, imap = c.imap || {}, out = {};
    if (smtp.host) out.smtp = { ...smtp, port: Number(smtp.port) || undefined, secure: Number(smtp.port) === 465 };
    if (imap.host) out.imap = { ...imap, port: Number(imap.port) || undefined, secure: Number(imap.port) !== 143 };
    return Object.keys(out).length ? out : null;
  }
  return null; // whatsapp_baileys : appairage par QR
}

// ---- Champs de credentials par canal (fini le JSON brut) ----
function CredentialFields({ channel, value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });
  if (channel === 'telegram') {
    return (
      <label>Token du bot (@BotFather)
        <input value={value.token || ''} onChange={(e) => set({ token: e.target.value })} placeholder="123456:ABC-DEF..." />
      </label>
    );
  }
  if (channel === 'whatsapp_cloud') {
    return (
      <div className="row">
        <label>Token (Graph API)
          <input value={value.token || ''} onChange={(e) => set({ token: e.target.value })} placeholder="EAA..." />
        </label>
        <label>Phone Number ID
          <input value={value.phoneNumberId || ''} onChange={(e) => set({ phoneNumberId: e.target.value })} placeholder="123456789012345" />
        </label>
      </div>
    );
  }
  if (channel === 'email') {
    const smtp = value.smtp || {}, imap = value.imap || {};
    const setSmtp = (p) => set({ smtp: { ...smtp, ...p } });
    const setImap = (p) => set({ imap: { ...imap, ...p } });
    return (
      <div className="row">
        <div>
          <h4>SMTP (envoi)</h4>
          <label>Hôte<input value={smtp.host || ''} onChange={(e) => setSmtp({ host: e.target.value })} placeholder="smtp.exemple.com" /></label>
          <label>Port<input value={smtp.port || ''} onChange={(e) => setSmtp({ port: e.target.value })} placeholder="465" /></label>
          <label>Utilisateur<input value={smtp.user || ''} onChange={(e) => setSmtp({ user: e.target.value })} /></label>
          <label>Mot de passe<input type="password" value={smtp.pass || ''} onChange={(e) => setSmtp({ pass: e.target.value })} /></label>
        </div>
        <div>
          <h4>IMAP (réception · optionnel)</h4>
          <label>Hôte<input value={imap.host || ''} onChange={(e) => setImap({ host: e.target.value })} placeholder="imap.exemple.com" /></label>
          <label>Port<input value={imap.port || ''} onChange={(e) => setImap({ port: e.target.value })} placeholder="993" /></label>
          <label>Utilisateur<input value={imap.user || ''} onChange={(e) => setImap({ user: e.target.value })} /></label>
          <label>Mot de passe<input type="password" value={imap.pass || ''} onChange={(e) => setImap({ pass: e.target.value })} /></label>
        </div>
      </div>
    );
  }
  return <p className="muted">Aucun identifiant à saisir : l'appairage se fait par QR code après la création.</p>;
}

// ---- Vue QR (WhatsApp Baileys) : sonde l'état et rend le QR côté client ----
function QrView({ connectionId }) {
  const [state, setState] = useState(null);
  const [dataUrl, setDataUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const s = await api.connectionQr(connectionId);
        if (!alive) return;
        setState(s);
        if (s.qr && s.status !== 'connected') setDataUrl(await QRCode.toDataURL(s.qr, { width: 260, margin: 1 }));
        else setDataUrl(null);
      } catch { /* ignore transient */ }
    }
    tick();
    const iv = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [connectionId]);

  if (!state) return <p className="muted">Chargement de l'état…</p>;
  if (state.status === 'connected') return <p className="ok">✓ Appareil connecté</p>;
  if (dataUrl) {
    return (
      <div className="qrbox">
        <img src={dataUrl} alt="QR WhatsApp" />
        <p className="muted">WhatsApp → <b>Appareils connectés</b> → <b>Connecter un appareil</b>. Rafraîchi automatiquement.</p>
      </div>
    );
  }
  return <p className="muted">Statut : {state.status} — QR en attente…</p>;
}

// ---- Envoi de test depuis l'UI ----
function TestSend({ connectionId }) {
  const [to, setTo] = useState('');
  const [text, setText] = useState('Test rs-connector ✅');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api.sendTest(connectionId, to, text);
      setMsg({ ok: true, text: `Envoyé (messageId : ${r.result && r.result.messageId ? r.result.messageId : 'ok'})` });
    } catch (err) {
      setMsg({ ok: false, text: err.data && err.data.error === 'connection_not_active' ? 'Connexion non active.' : (err.message || 'Échec') });
    } finally { setBusy(false); }
  }
  return (
    <form className="subform" onSubmit={send}>
      <div className="inline-row">
        <label>Destinataire<input value={to} onChange={(e) => setTo(e.target.value)} placeholder="chat_id / numéro / email" /></label>
        <label>Message<input value={text} onChange={(e) => setText(e.target.value)} /></label>
        <button type="submit" disabled={busy || !to || !text}>Envoyer</button>
      </div>
      {msg && <div className={msg.ok ? 'notice' : 'error'}>{msg.text}</div>}
    </form>
  );
}

// ---- Carte d'un canal (connexion) au sein d'une application ----
function ChannelCard({ c, onDelete, isDefault, canBeDefault, onToggleDefault, apps, onReassign }) {
  const [tab, setTab] = useState(null); // 'qr' | 'send' | 'move' | null
  const status = (c.state && c.state.status) || c.status;
  const isBaileys = c.channelType === 'whatsapp_baileys';
  return (
    <div className={`card${isDefault ? ' is-default' : ''}`}>
      <div className="card-head">
        <Icon name={CHANNEL_ICONS[c.channelType] || 'plug'} className="chan-ico" />
        <span className="id">{c.connectionId}</span>
        <span className="badge">{label(c.channelType)}</span>
        {isDefault && <span className="badge is-default" title="Canal par défaut de l'application (utilisé quand l'appel ne précise pas de canal)">★ défaut</span>}
        <span className="spacer" />
        <span className={`status ${status}`}><span className="dot" />{status}</span>
      </div>
      <div className="actions-inline">
        {isBaileys && <button className="secondary small" onClick={() => setTab(tab === 'qr' ? null : 'qr')}>{tab === 'qr' ? 'Masquer le QR' : 'Afficher le QR'}</button>}
        <button className="secondary small" onClick={() => setTab(tab === 'send' ? null : 'send')}>{tab === 'send' ? 'Fermer' : 'Tester l\u2019envoi'}</button>
        {canBeDefault && (
          isDefault
            ? <button className="small" onClick={onToggleDefault} title="Retirer ce canal comme défaut">★ Par défaut</button>
            : <button className="secondary small" onClick={onToggleDefault} title="Utiliser ce canal quand l'appel /v1/messages ne précise pas de canal">Définir par défaut</button>
        )}
        <button className="secondary small" onClick={() => setTab(tab === 'move' ? null : 'move')} title="Déplacer ce canal vers une autre application (n'interrompt pas la session)">Déplacer</button>
        <span className="spacer" />
        <button className="secondary small danger" onClick={onDelete}>Supprimer</button>
      </div>
      {tab === 'move' && (
        <div className="actions-inline">
          <label className="conn-app" title="Déplacer ce canal vers une autre application. Mise à jour base uniquement — la session live n'est pas coupée.">
            <span className="muted small">Déplacer vers</span>
            <select value={c.applicationId || ''} onChange={(e) => { onReassign(e.target.value); setTab(null); }}>
              <option value="">— Aucune (détacher) —</option>
              {(apps || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
      )}
      {tab === 'qr' && <QrView connectionId={c.connectionId} />}
      {tab === 'send' && <TestSend connectionId={c.connectionId} />}
    </div>
  );
}

// ---- Formulaire « Ajouter un canal » rattaché à UNE application ----
function slugify(s) { return String(s || 'app').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 12) || 'app'; }
function shortChan(t) { return (t || 'canal').split('_')[0]; }

function AddChannelForm({ app, channels, onCreate, onDone }) {
  const [connType, setConnType] = useState((channels[0] && channels[0].channelType) || 'telegram');
  const [connId, setConnId] = useState('');
  const [creds, setCreds] = useState({});
  const [webhook, setWebhook] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const suggested = `${slugify(app.name)}-${shortChan(connType)}`;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await onCreate({
        connectionId: (connId || suggested).trim(),
        channelType: connType,
        applicationId: app.id,
        webhookUrl: webhook || null,
        credentials: buildCreds(connType, creds),
      });
      setMsg({ ok: true, text: `Canal « ${r.connectionId} » ajouté (statut : ${r.state ? r.state.status : 'créé'}).` });
      setConnId(''); setCreds({}); setWebhook('');
      // WhatsApp Baileys : on laisse le formulaire ouvert pour afficher le QR via la carte.
      if (connType !== 'whatsapp_baileys' && onDone) setTimeout(onDone, 800);
    } catch (e2) {
      setMsg({ ok: false, text: e2.data && e2.data.error === 'encryption_not_configured'
        ? 'Chiffrement non configuré (CREDENTIALS_ENCRYPTION_KEY) sur rs-connector.'
        : (e2.data && e2.data.error === 'connection_conflict')
          ? 'Cet identifiant de canal est déjà utilisé par une autre application.'
          : (e2.message || 'Échec') });
    } finally { setBusy(false); }
  }

  return (
    <form className="subform add-channel" onSubmit={submit}>
      <div className="row">
        <label>Type de canal
          <select value={connType} onChange={(e) => { setConnType(e.target.value); setCreds({}); }}>
            {channels.map((c) => <option key={c.channelType} value={c.channelType}>{label(c.channelType)}</option>)}
          </select>
        </label>
        <label>Identifiant du canal
          <input value={connId} onChange={(e) => setConnId(e.target.value)} placeholder={suggested} />
        </label>
      </div>
      <div className="creds-block"><CredentialFields channel={connType} value={creds} onChange={setCreds} /></div>
      <details className="advanced"><summary className="muted small">Options avancées</summary>
        <label>Webhook URL (optionnel — hérite de l'application si vide)
          <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://mon-app/webhooks/rs-connector" />
        </label>
      </details>
      <div className="inline-row">
        <button type="submit" disabled={busy || !connType}>{busy ? 'Ajout…' : 'Ajouter le canal'}</button>
        {onDone && <button type="button" className="secondary" onClick={onDone}>Fermer</button>}
      </div>
      {msg && <div className={msg.ok ? 'notice' : 'error'}>{msg.text}</div>}
    </form>
  );
}

// ---- Bloc d'une application : ses canaux + ajout + actions ----
function ApplicationCard({ app, conns, channels, apps, defaultConnId, onToggleDefault, onReassign, onDeleteConn, onCreateConn, onRegenerate, onRotateSecret, onDeleteApp }) {
  const [adding, setAdding] = useState(false);
  const connectedCount = conns.filter((x) => ((x.state && x.state.status) || x.status) === 'connected').length;
  return (
    <div className="app-block">
      <div className="app-block-head">
        <div className="app-title">
          <h3>{app.name}</h3>
          <span className="badge">{app.api_key_prefix}…</span>
          <span className="muted small">{conns.length} canal{conns.length > 1 ? 'aux' : ''} · {connectedCount} connecté(s)</span>
          {app.webhook_url ? <span className="muted small" title={app.webhook_url}>webhook ✓</span> : <span className="muted small">aucun webhook</span>}
        </div>
        <div className="app-actions">
          <button onClick={() => setAdding((v) => !v)}>{adding ? 'Fermer' : '+ Ajouter un canal'}</button>
          <details className="app-menu"><summary className="secondary small">⋯</summary>
            <div className="app-menu-body">
              <button className="secondary small" onClick={() => onRegenerate(app)}>Régénérer la clé API</button>
              <button className="secondary small" onClick={() => onRotateSecret(app)}>Régénérer le secret webhook</button>
              <button className="secondary small danger" onClick={() => onDeleteApp(app)}>Supprimer l'application</button>
            </div>
          </details>
        </div>
      </div>

      <div className="app-channels">
        {conns.map((c) => (
          <ChannelCard
            key={c.connectionId}
            c={c}
            onDelete={() => onDeleteConn(c)}
            canBeDefault
            isDefault={defaultConnId === c.connectionId}
            onToggleDefault={() => onToggleDefault(c)}
            apps={apps}
            onReassign={(appId) => onReassign(c, appId)}
          />
        ))}
        {conns.length === 0 && !adding && <p className="muted app-empty">Aucun canal rattaché. Cliquez « + Ajouter un canal » pour connecter Telegram, WhatsApp, etc.</p>}
      </div>

      {adding && <AddChannelForm app={app} channels={channels} onCreate={onCreateConn} onDone={() => setAdding(false)} />}
    </div>
  );
}

// ---- Bouton copier ----
function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="secondary small" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* clipboard indispo */ }
    }}>{ok ? 'Copié ✓' : 'Copier'}</button>
  );
}

// ---- Activation de la 2FA (TOTP) ----
function TwoFactor() {
  const [step, setStep] = useState('idle'); // idle | setup | done
  const [otpUrl, setOtpUrl] = useState(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  async function start() {
    setMsg(null);
    try {
      const r = await api.totpSetup();
      setSecret(r.secret);
      setOtpUrl(await QRCode.toDataURL(r.otpauthUri, { width: 220, margin: 1 }));
      setStep('setup');
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  async function enable(e) {
    e.preventDefault(); setMsg(null);
    try {
      await api.totpEnable(code);
      setStep('done'); setMsg({ ok: true, text: '2FA activée. Elle sera demandée à la prochaine connexion.' });
    } catch (e2) { setMsg({ ok: false, text: e2.data && e2.data.error === 'invalid_otp' ? 'Code invalide.' : e2.message }); }
  }
  return (
    <section className="panel">
      <h2>Sécurité — 2FA (TOTP)</h2>
      {step === 'idle' && (<>
        <p className="muted">Ajoutez une vérification par code (Google Authenticator, etc.) à la connexion admin.</p>
        <button className="secondary small" onClick={start}>Configurer la 2FA</button>
      </>)}
      {step === 'setup' && (<>
        <p className="muted">1. Scannez ce QR avec votre application d'authentification (ou saisissez la clé) :</p>
        {otpUrl && <div className="qrbox"><img src={otpUrl} alt="QR 2FA" style={{ width: 220, height: 220 }} /></div>}
        <code className="key">{secret}</code>
        <form className="inline-row" onSubmit={enable} style={{ marginTop: 12 }}>
          <label>2. Code à 6 chiffres<input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
          <button type="submit" disabled={code.length < 6}>Activer</button>
        </form>
      </>)}
      {step === 'done' && <p className="ok">✓ 2FA activée</p>}
      {msg && <div className={msg.ok ? 'notice' : 'error'}>{msg.text}</div>}
    </section>
  );
}

// ---- Changement du mot de passe admin ----
function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);
  async function submit(e) {
    e.preventDefault(); setMsg(null);
    if (next.length < 10) { setMsg({ ok: false, text: 'Le nouveau mot de passe doit faire au moins 10 caractères.' }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: 'La confirmation ne correspond pas.' }); return; }
    try {
      await api.changePassword(current, next);
      setMsg({ ok: true, text: 'Mot de passe modifié avec succès.' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e2) {
      const code = e2.data && e2.data.error;
      const text = code === 'invalid_current_password' ? 'Mot de passe actuel incorrect.'
        : code === 'weak_password' ? 'Nouveau mot de passe trop court (10 caractères minimum).'
        : e2.message;
      setMsg({ ok: false, text });
    }
  }
  return (
    <section className="panel">
      <h2>Sécurité — Mot de passe</h2>
      <form onSubmit={submit}>
        <label>Mot de passe actuel<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label>Nouveau mot de passe<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label>Confirmer<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <button type="submit" disabled={!current || !next || !confirm} style={{ marginTop: 8 }}>Changer le mot de passe</button>
      </form>
      {msg && <div className={msg.ok ? 'notice' : 'error'}>{msg.text}</div>}
    </section>
  );
}

export default function Dashboard({ onLogout }) {
  const [channels, setChannels] = useState([]);
  const [apps, setApps] = useState([]);
  const [connections, setConnections] = useState([]);
  const [err, setErr] = useState(null);

  const [showNewApp, setShowNewApp] = useState(false);
  const [appName, setAppName] = useState('');
  const [appWebhook, setAppWebhook] = useState('');
  const [revealedKey, setRevealedKey] = useState(null);
  const [revealedFor, setRevealedFor] = useState(null);
  const [revealedSecret, setRevealedSecret] = useState(null);
  const [info, setInfo] = useState(null);
  const [meUser, setMeUser] = useState(null);
  const [view, setView] = useState('connexions');

  const refresh = useCallback(async () => {
    try {
      const [c, a, cx, inf, m] = await Promise.all([api.channels(), api.listApplications(), api.listConnections(), api.info().catch(() => null), api.me().catch(() => null)]);
      setChannels(c.channels || []);
      setApps(a.applications || []);
      setConnections(cx.connexions || []);
      if (inf) setInfo(inf);
      if (m) setMeUser(m.username);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 6000); // statuts en direct
    return () => clearInterval(iv);
  }, [refresh]);

  async function createApp(e) {
    e.preventDefault();
    setErr(null); setRevealedKey(null);
    try {
      const r = await api.createApplication(appName, appWebhook || null);
      setRevealedKey(r.apiKey); setRevealedFor(r.name || appName); setRevealedSecret(r.webhookSecret || null);
      setAppName(''); setAppWebhook(''); setShowNewApp(false);
      refresh();
    } catch (e2) { setErr(e2.message); }
  }

  async function regenerate(app) {
    if (!window.confirm(`Régénérer la clé de « ${app.name} » ? L'ancienne sera immédiatement révoquée.`)) return;
    setErr(null); setRevealedKey(null); setRevealedSecret(null);
    try {
      const r = await api.regenerateKey(app.id);
      setRevealedKey(r.apiKey); setRevealedFor(r.name || app.name);
      refresh();
    } catch (e2) { setErr(e2.message); }
  }

  async function rotateSecret(app) {
    if (!window.confirm(`Régénérer le secret webhook de « ${app.name} » ? L'ancien cessera de signer.`)) return;
    setErr(null); setRevealedKey(null); setRevealedSecret(null);
    try {
      const r = await api.rotateWebhookSecret(app.id);
      setRevealedSecret(r.webhookSecret); setRevealedFor(r.name || app.name);
      refresh();
    } catch (e2) { setErr(e2.message); }
  }

  async function delApp(app) {
    if (!window.confirm(`Supprimer l'application « ${app.name} » et TOUTES ses connexions ? Irréversible.`)) return;
    setErr(null);
    try { await api.deleteApplication(app.id); refresh(); } catch (e2) { setErr(e2.message); }
  }

  async function delConn(c) {
    if (!window.confirm(`Supprimer le canal « ${c.connectionId} » ? Cela coupe la connexion. Irréversible.`)) return;
    setErr(null);
    try { await api.deleteConnection(c.connectionId); refresh(); } catch (e2) { setErr(e2.message); }
  }

  const defaultByApp = {};
  for (const a of apps) if (a.default_connection_id) defaultByApp[a.id] = a.default_connection_id;

  async function toggleDefault(c) {
    setErr(null);
    const isDef = !!c.applicationId && defaultByApp[c.applicationId] === c.connectionId;
    try {
      if (isDef) await api.unsetDefaultConnection(c.connectionId);
      else await api.setDefaultConnection(c.connectionId);
      refresh();
    } catch (e2) {
      setErr(e2.data && e2.data.error === 'no_application'
        ? 'Rattachez d’abord ce canal à une application pour en faire le canal par défaut.'
        : e2.message);
    }
  }

  // Réassignation de l'application d'une connexion (mise à jour base uniquement, sans couper
  // la session live). applicationId vide => détache la connexion de toute application.
  async function reassignApp(c, applicationId) {
    setErr(null);
    try { await api.setConnectionApplication(c.connectionId, applicationId || null); refresh(); }
    catch (e2) { setErr(e2.message); }
  }

  // Création d'un canal (utilisé par le formulaire par-application). Renvoie la réponse ou lève.
  async function createConnection(payload) {
    const r = await api.createConnection(payload);
    refresh();
    return r;
  }

  const connsByApp = {};
  const unassigned = [];
  for (const c of connections) {
    if (c.applicationId) (connsByApp[c.applicationId] = connsByApp[c.applicationId] || []).push(c);
    else unassigned.push(c);
  }
  const connectedTotal = connections.filter((x) => ((x.state && x.state.status) || x.status) === 'connected').length;

  return (
    <>
      <IconSprite />
      <header className="topbar">
        <div className="brand">
          <span className="mark"><Logo size={30} /></span>
          <span className="word"><b>RS-Connector</b><span className="sub">Console d'administration</span></span>
        </div>
        <span className="spacer" />
        {meUser && <span className="who">Connecté : <b>{meUser}</b></span>}
        <button className="secondary" onClick={onLogout}>Déconnexion</button>
      </header>
      <nav className="viewtabs">
        <button className={`tab${view === 'connexions' ? ' on' : ''}`} onClick={() => setView('connexions')}><Icon name="plug" /> Connexions</button>
        <button className={`tab${view === 'docs' ? ' on' : ''}`} onClick={() => setView('docs')}><Icon name="file" /> Documentation</button>
        <button className={`tab${view === 'faq' ? ' on' : ''}`} onClick={() => setView('faq')}><Icon name="support" /> FAQ</button>
        <button className={`tab${view === 'dev' ? ' on' : ''}`} onClick={() => setView('dev')}><Icon name="globe" /> Développeurs</button>
      </nav>
      <main className="dash">
        {err && <div className="panel error">{err}</div>}

        {view === 'docs' && <DocsView />}
        {view === 'faq' && <FaqView />}
        {view === 'dev' && <DevView info={info} />}

        {view === 'connexions' && (<>
        <div className="summary">
          <span>{apps.length} application{apps.length > 1 ? 's' : ''}</span>
          <span>{connections.length} canal{connections.length > 1 ? 'aux' : ''}</span>
          <span className="ok-text">{connectedTotal} connecté(s)</span>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h2><Icon name="package" /> Applications &amp; canaux</h2>
            <button onClick={() => setShowNewApp((v) => !v)}>{showNewApp ? 'Fermer' : '+ Nouvelle application'}</button>
          </div>
          <p className="muted">Chaque application gère ses propres canaux (Telegram, WhatsApp, …). Ajoutez un canal directement sous l'application concernée.</p>

          {showNewApp && (
            <form className="subform" onSubmit={createApp}>
              <div className="row" style={{ alignItems: 'end' }}>
                <label>Nom de l'application<input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="ex : Deskstudio" /></label>
                <label>Webhook URL (optionnel)<input value={appWebhook} onChange={(e) => setAppWebhook(e.target.value)} placeholder="https://mon-app/webhooks/rs-connector" /></label>
                <div style={{ flex: '0 0 auto' }}><button type="submit" disabled={!appName}>Créer</button></div>
              </div>
            </form>
          )}

          {revealedKey && (
            <div className="notice">
              Clé API {revealedFor ? `de « ${revealedFor} »` : ''} (copiez-la maintenant, elle ne sera plus affichée) :
              <code className="key">{revealedKey}</code>
              <div style={{ marginTop: 8 }}><CopyBtn text={revealedKey} /></div>
            </div>
          )}
          {revealedSecret && (
            <div className="notice">
              Secret webhook {revealedFor ? `de « ${revealedFor} »` : ''} — vérifie la signature X-Webhook-Signature :
              <code className="key">{revealedSecret}</code>
              <div style={{ marginTop: 8 }}><CopyBtn text={revealedSecret} /></div>
            </div>
          )}

          <div className="app-list">
            {apps.map((a) => (
              <ApplicationCard
                key={a.id}
                app={a}
                conns={connsByApp[a.id] || []}
                channels={channels}
                apps={apps}
                defaultConnId={defaultByApp[a.id]}
                onToggleDefault={toggleDefault}
                onReassign={reassignApp}
                onDeleteConn={delConn}
                onCreateConn={createConnection}
                onRegenerate={regenerate}
                onRotateSecret={rotateSecret}
                onDeleteApp={delApp}
              />
            ))}
            {apps.length === 0 && <p className="muted">Aucune application. Cliquez « + Nouvelle application ».</p>}
          </div>
        </section>

        {unassigned.length > 0 && (
          <section className="panel">
            <h2>Canaux non assignés</h2>
            <p className="muted">Ces canaux ne sont rattachés à aucune application. Utilisez « Déplacer » pour les assigner.</p>
            <div className="app-channels">
              {unassigned.map((c) => (
                <ChannelCard
                  key={c.connectionId}
                  c={c}
                  onDelete={() => delConn(c)}
                  canBeDefault={false}
                  isDefault={false}
                  onToggleDefault={() => {}}
                  apps={apps}
                  onReassign={(appId) => reassignApp(c, appId)}
                />
              ))}
            </div>
          </section>
        )}

        {info && (
          <section className="panel">
            <h2>Endpoint d'intégration</h2>
            <p className="muted">URL de base {info.detected ? '(détectée — définissez PUBLIC_BASE_URL en production)' : '(configurée)'} :</p>
            <code className="key">{info.baseUrl}</code>
            <div className="table-wrap"><table style={{ marginTop: 12 }}>
              <tbody>
                <tr><td>Envoi de message</td><td><code>POST {info.endpoints.sendMessage}</code></td></tr>
                <tr><td>Lister les connexions</td><td><code>GET {info.endpoints.listConnections}</code></td></tr>
                <tr><td>Webhook WhatsApp Cloud</td><td><code>{info.endpoints.whatsappCloudWebhook}</code></td></tr>
                <tr><td>Authentification</td><td><code>{info.auth}</code></td></tr>
              </tbody>
            </table></div>
            <p className="muted" style={{ marginTop: 10 }}>Si l'appel omet <code className="mono">channel</code> et <code className="mono">connection_id</code>, il utilise le <b>canal par défaut</b> (★) de l'application.</p>
          </section>
        )}

        <TwoFactor />
        <ChangePassword />
        </>)}
      </main>
    </>
  );
}
