import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../context/useSession";

export default function ProtectedRoute() {
  const { sessionId, loading } = useSession();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="cp-auth cp-auth--center">
        <p className="cp-auth__muted">Loading…</p>
      </div>
    );
  }

  if (!sessionId) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  return <Outlet />;
}
