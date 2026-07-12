import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Icon } from './Icon.jsx';

// Composants de gestion des canaux/applications, paramétrés par un client `api` (admin ou user).
export const CHANNEL_LABELS = {
  whatsapp_baileys: 'WhatsApp · Baileys (QR)',
  whatsapp_cloud: 'WhatsApp Cloud · Meta',
  telegram: 'Telegram',
  email: 'Email · SMTP/IMAP',
};
export const label = (t) => CHANNEL_LABELS[t] || t;
export const CHANNEL_ICONS = { whatsapp_baileys: 'scan', whatsapp_cloud: 'package', telegram: 'chat', email: 'mail' };
// Liste de canaux dérivée (pas besoin d'un appel API dédié côté utilisateur).
export const CHANNELS = Object.keys(CHANNEL_LABELS).map((channelType) => ({ channelType }));

export function buildCreds(channel, c) {
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
  return null;
}

export function CredentialFields({ channel, value, onChange }) {
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
        <label>Token (Graph API)<input value={value.token || ''} onChange={(e) => set({ token: e.target.value })} placeholder="EAA..." /></label>
        <label>Phone Number ID<input value={value.phoneNumberId || ''} onChange={(e) => set({ phoneNumberId: e.target.value })} placeholder="123456789012345" /></label>
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

function QrView({ api, connectionId }) {
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
      } catch { /* transitoire */ }
    }
    tick();
    const iv = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [api, connectionId]);
  if (!state) return <p className="muted">Chargement de l'état…</p>;
  if (state.status === 'connected') return <p className="ok">✓ Appareil connecté</p>;
  if (dataUrl) return (
    <div className="qrbox">
      <img src={dataUrl} alt="QR WhatsApp" />
      <p className="muted">WhatsApp → <b>Appareils connectés</b> → <b>Connecter un appareil</b>. Rafraîchi automatiquement.</p>
    </div>
  );
  return <p className="muted">Statut : {state.status} — QR en attente…</p>;
}

function TestSend({ api, connectionId }) {
  const [to, setTo] = useState('');
  const [text, setText] = useState('Test rs-connector ✅');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const r = await api.sendTest(connectionId, to, text);
      setMsg({ ok: true, text: `Envoyé (${r.result && r.result.messageId ? r.result.messageId : 'ok'})` });
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

export function ChannelCard({ api, c, onDelete, isDefault, canBeDefault, onToggleDefault, apps, onReassign }) {
  const [tab, setTab] = useState(null);
  const status = (c.state && c.state.status) || c.status;
  const isBaileys = c.channelType === 'whatsapp_baileys';
  return (
    <div className={`card${isDefault ? ' is-default' : ''}`}>
      <div className="card-head">
        <Icon name={CHANNEL_ICONS[c.channelType] || 'plug'} className="chan-ico" />
        <span className="id">{c.connectionId}</span>
        <span className="badge">{label(c.channelType)}</span>
        {isDefault && <span className="badge is-default" title="Canal par défaut (envoi quand l'appel ne précise rien)">★ défaut</span>}
        <span className="spacer" />
        <span className={`status ${status}`}><span className="dot" />{status}</span>
      </div>
      <div className="actions-inline">
        {isBaileys && <button className="secondary small" onClick={() => setTab(tab === 'qr' ? null : 'qr')}>{tab === 'qr' ? 'Masquer le QR' : 'Afficher le QR'}</button>}
        <button className="secondary small" onClick={() => setTab(tab === 'send' ? null : 'send')}>{tab === 'send' ? 'Fermer' : 'Tester l\u2019envoi'}</button>
        {canBeDefault && (isDefault
          ? <button className="small" onClick={onToggleDefault} title="Retirer ce canal comme défaut">★ Par défaut</button>
          : <button className="secondary small" onClick={onToggleDefault} title="Définir comme canal par défaut">Définir par défaut</button>)}
        {apps && apps.length > 1 && <button className="secondary small" onClick={() => setTab(tab === 'move' ? null : 'move')}>Déplacer</button>}
        <span className="spacer" />
        <button className="secondary small danger" onClick={onDelete}>Supprimer</button>
      </div>
      {tab === 'move' && (
        <div className="actions-inline">
          <label className="conn-app"><span className="muted small">Déplacer vers</span>
            <select value={c.applicationId || ''} onChange={(e) => { onReassign(e.target.value); setTab(null); }}>
              {(apps || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
      )}
      {tab === 'qr' && <QrView api={api} connectionId={c.connectionId} />}
      {tab === 'send' && <TestSend api={api} connectionId={c.connectionId} />}
    </div>
  );
}

function slugify(s) { return String(s || 'app').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 12) || 'app'; }

export function AddChannelForm({ app, onCreate, onDone }) {
  const [connType, setConnType] = useState('telegram');
  const [connId, setConnId] = useState('');
  const [creds, setCreds] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const suggested = `${slugify(app.name)}-${(connType || 'ch').split('_')[0]}`;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const r = await onCreate({ connectionId: (connId || suggested).trim(), channelType: connType, applicationId: app.id, credentials: buildCreds(connType, creds) });
      setMsg({ ok: true, text: `Canal « ${r.connectionId} » ajouté (${r.state ? r.state.status : 'créé'}).` });
      setConnId(''); setCreds({});
      if (connType !== 'whatsapp_baileys' && onDone) setTimeout(onDone, 800);
    } catch (e2) {
      setMsg({ ok: false, text: e2.data && e2.data.error === 'connection_conflict' ? 'Identifiant de canal déjà utilisé.' : (e2.message || 'Échec') });
    } finally { setBusy(false); }
  }
  return (
    <form className="subform add-channel" onSubmit={submit}>
      <div className="row">
        <label>Type de canal
          <select value={connType} onChange={(e) => { setConnType(e.target.value); setCreds({}); }}>
            {CHANNELS.map((c) => <option key={c.channelType} value={c.channelType}>{label(c.channelType)}</option>)}
          </select>
        </label>
        <label>Identifiant du canal<input value={connId} onChange={(e) => setConnId(e.target.value)} placeholder={suggested} /></label>
      </div>
      <div className="creds-block"><CredentialFields channel={connType} value={creds} onChange={setCreds} /></div>
      <div className="inline-row">
        <button type="submit" disabled={busy || !connType}>{busy ? 'Ajout…' : 'Ajouter le canal'}</button>
        {onDone && <button type="button" className="secondary" onClick={onDone}>Fermer</button>}
      </div>
      {msg && <div className={msg.ok ? 'notice' : 'error'}>{msg.text}</div>}
    </form>
  );
}

export function ApplicationCard({ api, app, conns, apps, defaultConnId, onToggleDefault, onReassign, onDeleteConn, onCreateConn, onRegenerate, onRotateSecret, onDeleteApp }) {
  const [adding, setAdding] = useState(false);
  const connectedCount = conns.filter((x) => ((x.state && x.state.status) || x.status) === 'connected').length;
  return (
    <div className="app-block">
      <div className="app-block-head">
        <div className="app-title">
          <h3>{app.name}</h3>
          <span className="badge">{app.api_key_prefix}…</span>
          <span className="muted small">{conns.length} canal{conns.length > 1 ? 'aux' : ''} · {connectedCount} connecté(s)</span>
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
          <ChannelCard key={c.connectionId} api={api} c={c} onDelete={() => onDeleteConn(c)} canBeDefault
            isDefault={defaultConnId === c.connectionId} onToggleDefault={() => onToggleDefault(c)} apps={apps} onReassign={(id) => onReassign(c, id)} />
        ))}
        {conns.length === 0 && !adding && <p className="muted app-empty">Aucun canal. Cliquez « + Ajouter un canal » (Telegram, WhatsApp…).</p>}
      </div>
      {adding && <AddChannelForm app={app} onCreate={onCreateConn} onDone={() => setAdding(false)} />}
    </div>
  );
}

export function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="secondary small" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* clipboard indispo */ }
    }}>{ok ? 'Copié ✓' : 'Copier'}</button>
  );
}
