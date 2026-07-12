import { useEffect, useState } from 'react';
import { userApi } from '../api';
import Logo from './Logo.jsx';
import UserDashboard from './UserDashboard.jsx';

function readUrlNotice() {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  if (p.get('verified') === '1') return { ok: true, text: 'Email confirmé ! Vous pouvez maintenant vous connecter.' };
  const v = p.get('verify');
  if (v === 'invalid') return { ok: false, text: 'Lien de vérification invalide ou expiré. Renvoyez un email de confirmation.' };
  if (v === 'error' || v === 'missing') return { ok: false, text: 'La vérification a échoué. Réessayez.' };
  return null;
}

function AuthCard({ onAuthed, onNeedVerify }) {
  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice] = useState(() => readUrlNotice());

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = mode === 'register' ? await userApi.register(email, password) : await userApi.login(email, password);
      if (r.needsVerification) { onNeedVerify(email); return; }
      userApi.setCsrf(r.csrfToken);
      onAuthed(r.email);
    } catch (err) {
      const code = err.data && err.data.error;
      if (code === 'email_not_verified') { onNeedVerify(email); return; }
      setError(
        code === 'email_taken' ? 'Un compte existe déjà avec cet email.'
          : code === 'invalid_email' ? 'Adresse email invalide.'
          : code === 'weak_password' ? 'Mot de passe : 8 caractères minimum.'
          : err.status === 429 ? 'Trop de tentatives, réessayez plus tard.'
          : mode === 'register' ? 'Inscription impossible.' : 'Identifiants invalides.',
      );
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo"><Logo size={46} /></div>
        <h1>RS-Connector</h1>
        <p className="sub">{mode === 'register' ? 'Créez votre compte' : 'Connectez-vous à votre espace'}</p>
        {notice && <div className={notice.ok ? 'notice' : 'error'}>{notice.text}</div>}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
        <label htmlFor="pw">Mot de passe</label>
        <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
        <button type="submit" disabled={busy || !email || !password}>{mode === 'register' ? 'Créer mon compte' : 'Se connecter'}</button>
        {error && <div className="error">{error}</div>}
        <p className="auth-switch">
          {mode === 'register' ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
          <a onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(null); }}>
            {mode === 'register' ? 'Se connecter' : 'Créer un compte'}
          </a>
        </p>
      </form>
      <p className="auth-tagline">Le hub multicanal pour brancher <b>WhatsApp</b>, <b>Telegram</b> et <b>Email</b> à vos applications, via une API unique et des webhooks signés.</p>
      <a className="auth-admin-link" href="#admin">Accès administrateur</a>
    </div>
  );
}

function VerifyNotice({ email, onBack }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function resend() {
    setBusy(true); setMsg(null);
    try { await userApi.resendVerification(email); setMsg({ ok: true, text: 'Email renvoyé. Vérifiez votre boîte (et les spams).' }); }
    catch { setMsg({ ok: false, text: 'Impossible de renvoyer pour le moment.' }); }
    finally { setBusy(false); }
  }
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo"><Logo size={46} /></div>
        <h1>Vérifiez votre email</h1>
        <p className="sub">Un lien de confirmation a été envoyé à<br /><b>{email}</b></p>
        <p className="muted" style={{ textAlign: 'center' }}>Ouvrez-le pour activer votre compte, puis connectez-vous. Pensez à vérifier les spams.</p>
        <button className="secondary" onClick={resend} disabled={busy}>{busy ? 'Envoi…' : 'Renvoyer l\u2019email'}</button>
        {msg && <div className={msg.ok ? 'notice' : 'error'}>{msg.text}</div>}
        <p className="auth-switch"><a onClick={onBack}>Retour à la connexion</a></p>
      </div>
    </div>
  );
}

export default function UserApp() {
  const [phase, setPhase] = useState('loading'); // loading | auth | verify | dashboard
  const [email, setEmail] = useState(null);

  useEffect(() => {
    userApi.me().then((m) => { userApi.setCsrf(m.csrfToken); setEmail(m.email); setPhase('dashboard'); }).catch(() => setPhase('auth'));
  }, []);

  async function handleLogout() {
    await userApi.logout().catch(() => {});
    userApi.setCsrf(null); setEmail(null); setPhase('auth');
  }

  if (phase === 'loading') return <div className="center">Chargement…</div>;
  if (phase === 'verify') return <VerifyNotice email={email} onBack={() => setPhase('auth')} />;
  if (phase === 'auth') return <AuthCard onAuthed={(e) => { setEmail(e); setPhase('dashboard'); }} onNeedVerify={(e) => { setEmail(e); setPhase('verify'); }} />;
  return <UserDashboard email={email} onLogout={handleLogout} />;
}
