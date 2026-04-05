import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { LoginGeneFoodCanvas } from "../components/LoginGeneFoodCanvas";
import { Logo } from "../components/Logo";
import { useSession } from "../context/SessionContext";

export default function LoginPage() {
  const { sessionId, login } = useSession();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/";

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (sessionId) {
    return <Navigate to={from === "/login" ? "/" : from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!termsAccepted) {
      setError("Please accept the terms to continue.");
      return;
    }
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
    <div className="cp-login">
      <nav className="cp-login__nav" aria-label="Sign in">
        <Link to="/" className="cp-login__brand">
          <Logo variant="compact" />
          <span className="cp-login__brand-text">CarePilot</span>
        </Link>
        <Link
          to="/"
          className="cp-login__nav-icon"
          title="Home"
          aria-label="Home"
        >
          <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10.5L12 3l9 7.5M5 10v10h14V10"
            />
          </svg>
        </Link>
      </nav>

      <LoginGeneFoodCanvas className="cp-login__canvas" />

      <div className="cp-login__wrap">
        <div className="cp-login__card">
          <div className="cp-login__title-row">
            <Link to="/" className="cp-login__back" aria-label="Back to home">
              <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
                <polyline
                  points="15 18 9 12 15 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <h1 className="cp-login__title">Log in</h1>
          </div>

          <p className="cp-login__lede">
            Nutrition and habits meet your profile—genes load the map, whole
            foods fuel the path. Sign in with username and email (demo: no
            password).
          </p>

          <form className="cp-login__form" onSubmit={(e) => void onSubmit(e)}>
            <div className="cp-login__field">
              <label className="cp-login__label" htmlFor="login-username">
                Username
              </label>
              <input
                id="login-username"
                className="cp-login__input"
                name="username"
                autoComplete="username"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="cp-login__field">
              <label className="cp-login__label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                className="cp-login__input"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error ? (
              <p className="cp-login__error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="cp-login__submit"
              disabled={busy || !termsAccepted}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <div className="cp-login__footer-row">
              <span className="cp-login__hint">
                Username + email only—no password in this demo.
              </span>
              <span className="cp-login__first-time">
                New?{" "}
                <Link to="/quick-check" className="cp-login__inline-link">
                  Quick check
                </Link>
              </span>
            </div>

            <div className="cp-login__terms">
              <input
                type="checkbox"
                className="cp-login__terms-check"
                id="login-terms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <label htmlFor="login-terms" className="cp-login__terms-label">
                I understand CarePilot is for{" "}
                <strong>education and navigation</strong>, not a diagnosis or
                medical nutrition therapy. I agree to the{" "}
                <a
                  href="https://www.myplate.gov/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  trusted public resources
                </a>{" "}
                framing used in the app.
              </label>
            </div>
          </form>

          <p className="cp-login__demo-note">
            Demo: sign-in is passwordless. Profile data is stored on the backend
            server and may reset if the app is redeployed or server storage is
            cleared.
          </p>
        </div>
      </div>
    </div>
  );
}
