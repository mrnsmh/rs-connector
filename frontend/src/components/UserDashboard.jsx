import { useCallback, useEffect, useState } from 'react';
import { userApi } from '../api';
import Logo from './Logo.jsx';
import { Icon, IconSprite } from './Icon.jsx';
import { ApplicationCard, CopyBtn } from './channels.jsx';
import { DocsView, FaqView, DevView } from './Views.jsx';

export default function UserDashboard({ email, onLogout }) {
  const [apps, setApps] = useState([]);
  const [connections, setConnections] = useState([]);
  const [err, setErr] = useState(null);
  const [view, setView] = useState('apps');
  const [showNewApp, setShowNewApp] = useState(false);
  const [appName, setAppName] = useState('');
  const [appWebhook, setAppWebhook] = useState('');
  const [revealed, setRevealed] = useState(null); // { name, apiKey, webhookSecret }

  const refresh = useCallback(async () => {
    try {
      const [a, cx] = await Promise.all([userApi.listApplications(), userApi.listConnections()]);
      setApps(a.applications || []);
      setConnections(cx.connexions || []);
    } catch (e) { if (e.status === 401) onLogout(); else setErr(e.message); }
  }, [onLogout]);

  useEffect(() => { refresh(); const iv = setInterval(refresh, 6000); return () => clearInterval(iv); }, [refresh]);

  async function createApp(e) {
    e.preventDefault(); setErr(null); setRevealed(null);
    try {
      const r = await userApi.createApplication(appName, appWebhook || null);
      setRevealed({ name: r.name, apiKey: r.apiKey, webhookSecret: r.webhookSecret });
      setAppName(''); setAppWebhook(''); setShowNewApp(false); refresh();
    } catch (e2) { setErr(e2.message); }
  }
  async function regenerate(app) {
    if (!window.confirm(`Régénérer la clé de « ${app.name} » ? L'ancienne sera révoquée.`)) return;
    setErr(null); setRevealed(null);
    try { const r = await userApi.regenerateKey(app.id); setRevealed({ name: r.name, apiKey: r.apiKey }); refresh(); }
    catch (e2) { setErr(e2.message); }
  }
  async function rotateSecret(app) {
    if (!window.confirm(`Régénérer le secret webhook de « ${app.name} » ?`)) return;
    setErr(null); setRevealed(null);
    try { const r = await userApi.rotateWebhookSecret(app.id); setRevealed({ name: r.name, webhookSecret: r.webhookSecret }); refresh(); }
    catch (e2) { setErr(e2.message); }
  }
  async function delApp(app) {
    if (!window.confirm(`Supprimer « ${app.name} » et TOUS ses canaux ? Irréversible.`)) return;
    setErr(null);
    try { await userApi.deleteApplication(app.id); refresh(); } catch (e2) { setErr(e2.message); }
  }
  async function delConn(c) {
    if (!window.confirm(`Supprimer le canal « ${c.connectionId} » ? Cela coupe la connexion.`)) return;
    setErr(null);
    try { await userApi.deleteConnection(c.connectionId); refresh(); } catch (e2) { setErr(e2.message); }
  }
  const defaultByApp = {};
  for (const a of apps) if (a.default_connection_id) defaultByApp[a.id] = a.default_connection_id;
  async function toggleDefault(c) {
    setErr(null);
    const isDef = !!c.applicationId && defaultByApp[c.applicationId] === c.connectionId;
    try { if (isDef) await userApi.unsetDefaultConnection(c.connectionId); else await userApi.setDefaultConnection(c.connectionId); refresh(); }
    catch (e2) { setErr(e2.message); }
  }
  async function reassignApp(c, applicationId) {
    setErr(null);
    try { await userApi.setConnectionApplication(c.connectionId, applicationId || null); refresh(); } catch (e2) { setErr(e2.message); }
  }
  async function createConnection(payload) { const r = await userApi.createConnection(payload); refresh(); return r; }

  const connsByApp = {};
  for (const c of connections) if (c.applicationId) (connsByApp[c.applicationId] = connsByApp[c.applicationId] || []).push(c);
  const connectedTotal = connections.filter((x) => ((x.state && x.state.status) || x.status) === 'connected').length;

  return (
    <>
      <IconSprite />
      <header className="topbar">
        <div className="brand">
          <span className="mark"><Logo size={30} /></span>
          <span className="word"><b>RS-Connector</b><span className="sub">Espace self-service</span></span>
        </div>
        <span className="spacer" />
        {email && <span className="who">{email}</span>}
        <button className="secondary" onClick={onLogout}>Déconnexion</button>
      </header>
      <nav className="viewtabs">
        <button className={`tab${view === 'apps' ? ' on' : ''}`} onClick={() => setView('apps')}><Icon name="package" /> Mes applications</button>
        <button className={`tab${view === 'docs' ? ' on' : ''}`} onClick={() => setView('docs')}><Icon name="file" /> Documentation</button>
        <button className={`tab${view === 'faq' ? ' on' : ''}`} onClick={() => setView('faq')}><Icon name="support" /> FAQ</button>
        <button className={`tab${view === 'dev' ? ' on' : ''}`} onClick={() => setView('dev')}><Icon name="globe" /> Développeurs</button>
      </nav>
      <main className="dash">
        {err && <div className="panel error">{err}</div>}
        {view === 'docs' && <DocsView />}
        {view === 'faq' && <FaqView />}
        {view === 'dev' && <DevView />}

        {view === 'apps' && (<>
          <div className="summary">
            <span>{apps.length} application{apps.length > 1 ? 's' : ''}</span>
            <span>{connections.length} canal{connections.length > 1 ? 'aux' : ''}</span>
            <span className="ok-text">{connectedTotal} connecté(s)</span>
          </div>
          <section className="panel">
            <div className="panel-head">
              <h2><Icon name="package" /> Mes applications &amp; canaux</h2>
              <button onClick={() => setShowNewApp((v) => !v)}>{showNewApp ? 'Fermer' : '+ Nouvelle application'}</button>
            </div>
            <p className="muted">Créez une application (elle reçoit une clé API + un secret webhook), puis ajoutez-lui des canaux (Telegram, WhatsApp, Email). Vos applications sont privées.</p>

            {showNewApp && (
              <form className="subform" onSubmit={createApp}>
                <div className="row" style={{ alignItems: 'end' }}>
                  <label>Nom de l'application<input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="ex : Mon service client" /></label>
                  <label>Webhook URL (optionnel)<input value={appWebhook} onChange={(e) => setAppWebhook(e.target.value)} placeholder="https://mon-app/webhooks/rs-connector" /></label>
                  <div style={{ flex: '0 0 auto' }}><button type="submit" disabled={!appName}>Créer</button></div>
                </div>
              </form>
            )}
            {revealed && (
              <div className="notice">
                {revealed.apiKey && (<>Clé API {revealed.name ? `de « ${revealed.name} »` : ''} (copiez-la maintenant, elle ne sera plus affichée) :<code className="key">{revealed.apiKey}</code><div style={{ marginTop: 8 }}><CopyBtn text={revealed.apiKey} /></div></>)}
                {revealed.webhookSecret && (<><div style={{ marginTop: revealed.apiKey ? 12 : 0 }}>Secret webhook (signature X-Webhook-Signature) :</div><code className="key">{revealed.webhookSecret}</code><div style={{ marginTop: 8 }}><CopyBtn text={revealed.webhookSecret} /></div></>)}
              </div>
            )}

            <div className="app-list">
              {apps.map((a) => (
                <ApplicationCard key={a.id} api={userApi} app={a} conns={connsByApp[a.id] || []} apps={apps}
                  defaultConnId={defaultByApp[a.id]} onToggleDefault={toggleDefault} onReassign={reassignApp}
                  onDeleteConn={delConn} onCreateConn={createConnection} onRegenerate={regenerate} onRotateSecret={rotateSecret} onDeleteApp={delApp} />
              ))}
              {apps.length === 0 && <p className="muted">Aucune application. Cliquez « + Nouvelle application » pour démarrer.</p>}
            </div>
          </section>
        </>)}
      </main>
    </>
  );
}
