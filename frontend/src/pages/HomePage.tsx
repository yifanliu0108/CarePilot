import { Link } from "react-router-dom";
import { useSession } from "../context/SessionContext";

export default function HomePage() {
  const { me, sessionId, loading } = useSession();
  const done = me?.profile.completedOnboarding;

  const startJourney =
    sessionId && done
      ? { to: "/chat" as const }
      : sessionId && !done
        ? { to: "/input" as const }
        : { to: "/login" as const, state: { from: "/input" } as const };

  const startBusy = Boolean(sessionId && loading);

  return (
    <div className="cp-cover">
      <div className="cp-cover__panel">
        <h1 className="cp-home__hero">A copilot for how you eat and feel</h1>
        <p className="cp-cover__lede">
          Tell CarePilot what matters—sleep, focus, digestion, soreness, or staying well—and get
          practical food ideas plus a daily meal plan shaped around you. Chat is your starting
          point; when you want deeper help, optional Browser Use Cloud can open trusted sites in a
          live session so you are not hunting tabs alone.
        </p>
        {!done ? (
          <p className="cp-cover__meta cp-cover__meta--warn">
            Add a quick health snapshot on the{" "}
            <Link to="/input" className="cp-inline-link">
              input page
            </Link>{" "}
            so chat suggestions and your meal plan match your profile.
          </p>
        ) : (
          <p className="cp-cover__meta">
            Your snapshot is saved for this session. View or tweak it anytime in{" "}
            <Link to="/profile" className="cp-inline-link">
              Profile
            </Link>
            .
          </p>
        )}
        <div className="cp-home__actions">
          {startBusy ? (
            <button type="button" className="cp-btn cp-btn--primary" disabled>
              Loading…
            </button>
          ) : (
            <Link
              to={startJourney.to}
              state={"state" in startJourney ? startJourney.state : undefined}
              className="cp-btn cp-btn--primary"
            >
              Start your journey
            </Link>
          )}
          <Link to="/input" className="cp-btn cp-btn--secondary">
            {done ? "Update health input" : "Enter health information"}
          </Link>
        </div>
      </div>
    </div>
  );
}
