import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Logo } from "../components/Logo";
import { useSession } from "../context/useSession";

export default function LoginPage() {
  const { sessionId, login } = useSession();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/";

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (sessionId) {
    return <Navigate to={from === "/login" ? "/" : from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cp-auth cp-auth--enter">
      <div className="cp-auth__card">
        <h1 className="cp-auth__title cp-auth__title--logo">
          <Logo variant="hero" />
        </h1>
        <p className="cp-auth__lede">Sign in with your username and email to continue.</p>
        <form className="cp-form" onSubmit={(e) => void onSubmit(e)}>
          <label className="cp-form__label">
            Username
            <input
              className="cp-form__input"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="cp-form__label">
            Email
            <input
              className="cp-form__input"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="cp-form__error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="cp-btn cp-btn--primary cp-form__submit" disabled={busy}>
            {busy ? "Signing in…" : "Log in"}
          </button>
        </form>
        <p className="cp-auth__foot">
          Demo app: data is stored in server memory and clears when the API restarts.
        </p>
      </div>
    </div>
  );
}
