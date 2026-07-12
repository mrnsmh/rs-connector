import { useEffect, useState } from 'react';
import { userApi } from '../api';
import Logo from './Logo.jsx';
import UserDashboard from './UserDashboard.jsx';

function AuthCard({ onAuthed }) {
  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = mode === 'register' ? await userApi.register(email, password) : await userApi.login(email, password);
      userApi.setCsrf(r.csrfToken);
      onAuthed(r.email);
    } catch (err) {
      const code = err.data && err.data.error;
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
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-logo"><Logo size={46} /></div>
      <h1>RS-Connector</h1>
      <p className="sub">{mode === 'register' ? 'Créez votre compte' : 'Connectez-vous à votre espace'}</p>
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
  );
}

export default function UserApp() {
  const [phase, setPhase] = useState('loading'); // loading | auth | dashboard
  const [email, setEmail] = useState(null);

  useEffect(() => {
    userApi.me().then((m) => { userApi.setCsrf(m.csrfToken); setEmail(m.email); setPhase('dashboard'); }).catch(() => setPhase('auth'));
  }, []);

  async function handleLogout() {
    await userApi.logout().catch(() => {});
    userApi.setCsrf(null); setEmail(null); setPhase('auth');
  }

  if (phase === 'loading') return <div className="center">Chargement…</div>;
  if (phase === 'auth') return <AuthCard onAuthed={(e) => { setEmail(e); setPhase('dashboard'); }} />;
  return <UserDashboard email={email} onLogout={handleLogout} />;
}
