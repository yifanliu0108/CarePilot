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
        <h1 className="cp-home__hero">Beyond recommendations—we take action</h1>
        <p className="cp-cover__lede">
          Most apps stop at advice. <strong>CarePilot</strong> is named because you’re{" "}
          <strong>not sick yet</strong>—you need guidance to <strong>stay on track</strong> with
          subhealth: sleep, focus, digestion, movement, resilience. Chat turns into{" "}
          <strong>Live actions</strong>: optional browser automation opens trusted sites and runs
          steps you approve—we don’t just tell you what to do, we help{" "}
          <strong>do it with you</strong>. Not diagnosis or emergency care.
        </p>
        {!done ? (
          <p className="cp-cover__meta cp-cover__meta--warn">
            Add your basics on the{" "}
            <Link to="/input" className="cp-inline-link">
              input page
            </Link>{" "}
            so recommendations and your meal plan can use your profile.
          </p>
        ) : (
          <p className="cp-cover__meta">
            Your profile is saved for this session. Open{" "}
            <Link to="/profile" className="cp-inline-link">
              Profile
            </Link>{" "}
            anytime to review it.
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
