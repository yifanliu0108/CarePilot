import { Link } from "react-router-dom";
import { useSession } from "../context/useSession";

export default function HomePage() {
  const { me, sessionId, loading } = useSession();
  const done = me?.profile.completedOnboarding;

  const checkTarget = sessionId
    ? ({ to: "/quick-check" as const } as const)
    : ({ to: "/login" as const, state: { from: "/quick-check" } as const } as const);

  const checkBusy = Boolean(sessionId && loading);

  return (
    <div className="cp-cover cp-cover--landing">
      <HeroBackdrop />

      <div className="cp-landing cp-landing--hero">
        <p className="cp-landing__brand">CarePilot</p>

        <div className="cp-landing__rule" aria-hidden />

        <h1 className="cp-landing__headline">
          <span className="cp-landing__headline-line">Small signals.</span>
          <span className="cp-landing__headline-line cp-landing__headline-line--accent">Big consequences.</span>
        </h1>

        <p className="cp-landing__lede">
          We know that you are busy. We will make them clear — before it&apos;s too late.
        </p>

        <div className="cp-landing__cta">
          {checkBusy ? (
            <button type="button" className="cp-btn cp-btn--primary cp-landing__btn" disabled>
              Loading…
            </button>
          ) : (
            <Link
              to={checkTarget.to}
              state={"state" in checkTarget ? checkTarget.state : undefined}
              className="cp-btn cp-btn--primary cp-landing__btn"
            >
              Start 2-min check
            </Link>
          )}
        </div>

        {sessionId && !loading ? (
          <nav className="cp-landing__sub" aria-label="Quick links">
            <Link to="/profile" className="cp-landing__sub-link">
              Profile
            </Link>
            {done ? (
              <>
                <span className="cp-landing__sub-sep" aria-hidden>
                  ·
                </span>
                <Link to="/plan" className="cp-landing__sub-link">
                  Meal plan
                </Link>
              </>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
