import { useState, useEffect } from 'react';
import Logo from './Logo.jsx';

export default function Login({ onSubmit, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Google Identity Services - Initialisation
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: "77199687082-bpb61joduk7fm8ndthfs4hiphk6ie74e.apps.googleusercontent.com",
          callback: handleGoogleCredential,
        });
        const btn = document.getElementById("google-signin-btn");
        if (btn) {
          window.google.accounts.id.renderButton(btn, {
            theme: "outline",
            size: "large",
            width: "100%",
            text: "continue_with",
          });
        }
      }
    };
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  // Handler pour le credential Google
  async function handleGoogleCredential(response) {
    setBusy(true);
    try {
      const res = await fetch("/admin/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          credential: response.credential,
          client_id: "77199687082-bpb61joduk7fm8ndthfs4hiphk6ie74e.apps.googleusercontent.com",
        }),
      });
      const data = await res.json();
      if (res.ok && data.csrfToken) {
        window.location.href = "/admin/";
      } else {
        alert(data.error || "Erreur de connexion Google");
      }
    } catch (err) {
      alert("Erreur de connexion à Google");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(username, password); } finally { setBusy(false); }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-logo"><Logo size={46} /></div>
      <h1>RS-Connector</h1>
      <p className="sub">Console d'administration</p>
      <label htmlFor="u">Identifiant</label>
      <input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
      <label htmlFor="p">Mot de passe</label>
      <input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      <button type="submit" disabled={busy || !username || !password}>Se connecter</button>
      <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0', gap: '0.5rem' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
        <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>ou</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
      </div>
      <div id="google-signin-btn" style={{ display: 'flex', justifyContent: 'center' }} />
      {error && <div className="error">{error}</div>}
    </form>
  );
}
