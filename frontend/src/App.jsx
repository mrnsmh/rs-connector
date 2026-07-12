import { useEffect, useState } from 'react';
import { api, setCsrf } from './api';
import Login from './components/Login.jsx';
import Otp from './components/Otp.jsx';
import Dashboard from './components/Dashboard.jsx';
import UserApp from './components/UserApp.jsx';

// Back-office ADMIN (mvr) — flux inchangé : login → OTP → dashboard global. Accessible via #admin.
function AdminApp() {
  const [phase, setPhase] = useState('loading'); // loading | login | otp | dashboard
  const [error, setError] = useState(null);

  useEffect(() => {
    api.me().then((m) => { setCsrf(m.csrfToken); setPhase('dashboard'); }).catch(() => setPhase('login'));
  }, []);

  async function handleLogin(username, password) {
    setError(null);
    try {
      const r = await api.login(username, password);
      setCsrf(r.csrfToken);
      setPhase(r.otpRequired && !r.otpVerified ? 'otp' : 'dashboard');
    } catch (e) {
      setError(e.status === 429 ? 'Compte temporairement verrouillé (trop de tentatives).' : 'Identifiants invalides.');
    }
  }

  async function handleOtp(code) {
    setError(null);
    try {
      const r = await api.otp(code);
      setCsrf(r.csrfToken);
      setPhase('dashboard');
    } catch {
      setError('Code de vérification invalide.');
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    setCsrf(null);
    setPhase('login');
  }

  if (phase === 'loading') return <div className="center">Chargement…</div>;
  if (phase === 'login') return <Login onSubmit={handleLogin} error={error} />;
  if (phase === 'otp') return <Otp onSubmit={handleOtp} error={error} />;
  return <Dashboard onLogout={handleLogout} />;
}

// Routage : espace SELF-SERVICE utilisateur par défaut ; back-office admin via #admin.
export default function App() {
  const [mode] = useState(() => (typeof window !== 'undefined' && window.location.hash.replace(/^#/, '') === 'admin') ? 'admin' : 'user');
  // Un changement de hash (#admin ⇄ racine) recharge pour appliquer le bon espace.
  useEffect(() => {
    const onHash = () => window.location.reload();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return mode === 'admin' ? <AdminApp /> : <UserApp />;
}
