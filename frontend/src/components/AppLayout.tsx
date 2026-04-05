import { NavLink, Outlet } from "react-router-dom";
import { useSession } from "../context/useSession";
import { Logo } from "./Logo";

type Tab = { to: string; label: string; end?: boolean };

const tabs: Tab[] = [
  { to: "/", label: "Home", end: true },
  { to: "/quick-check", label: "Quick check" },
  { to: "/input", label: "Health input" },
  { to: "/chat", label: "Chat" },
  { to: "/plan", label: "Meal plan" },
];

export default function AppLayout() {
  const { logout, me, sessionId } = useSession();
  const { pathname } = useLocation();
  const hideSidebar = pathname === "/" || pathname === "/quick-check";

  return (
    <div className={"cp-shell" + (hideSidebar ? " cp-shell--full" : "")}>
      {!hideSidebar ? (
      <aside className="cp-sidebar" aria-label="Main navigation">
        <div className="cp-sidebar__brand">
          <Logo />
        </div>
        <nav className="cp-nav">
          {tabs.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={!!end}
              className={({ isActive }) =>
                "cp-nav__link" + (isActive ? " cp-nav__link--active" : "")
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="cp-sidebar__foot">
          {sessionId ? (
            <>
              {me ? (
                <p className="cp-sidebar__user" title={me.email}>
                  {me.username}
                </p>
              ) : null}
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  "cp-sidebar__profile" + (isActive ? " cp-sidebar__profile--active" : "")
                }
              >
                Profile
              </NavLink>
              <button type="button" className="cp-sidebar__logout" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <NavLink
              to="/login"
              state={{ from: "/input" }}
              className={({ isActive }) =>
                "cp-sidebar__profile" + (isActive ? " cp-sidebar__profile--active" : "")
              }
            >
              Sign in
            </NavLink>
          )}
        </div>
      </aside>
      ) : null}
      <div className="cp-main">
        <Outlet />
      </div>
    </div>
  );
}
