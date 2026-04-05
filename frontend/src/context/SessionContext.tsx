import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  apiFetch,
  apiUrl,
  clearStoredSessionId,
  getStoredSessionId,
  setStoredSessionId,
} from "../api/session";
import { SessionContext, type Me } from "./sessionContextBase";

export type {
  ChatMealPlanContext,
  HealthProfile,
  Me,
  SessionContextValue,
} from "./sessionContextBase";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(() => getStoredSessionId());
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const sid = getStoredSessionId();
    setSessionId(sid);
    if (!sid) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const r = await apiFetch("/api/me");
      if (!r.ok) {
        clearStoredSessionId();
        setSessionId(null);
        setMe(null);
        setLoading(false);
        return;
      }
      const text = await r.text();
      if (!text?.trim()) {
        setMe(null);
        return;
      }
      const data = JSON.parse(text) as Me;
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (username: string, email: string) => {
    const r = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email }),
    });
    const text = await r.text();
    let data: { sessionId?: string; error?: string } = {};
    if (text?.trim()) {
      try {
        data = JSON.parse(text) as { sessionId?: string; error?: string };
      } catch {
        throw new Error(
          `Bad response from server (${r.status}). Start the backend so it listens on port 3001 (e.g. npm run dev from the repo root).`,
        );
      }
    }
    if (!r.ok) {
      throw new Error(
        data.error ??
          (r.status === 502 || r.status === 504
            ? "Cannot reach the API. Run the backend on port 3001 (npm run dev)."
            : `Login failed (${r.status})`),
      );
    }
    if (!data.sessionId) {
      throw new Error(
        "No session from server. Is the API running? Empty responses usually mean the backend is not up.",
      );
    }
    setStoredSessionId(data.sessionId);
    setSessionId(data.sessionId);
    await refreshMe();
  }, [refreshMe]);

  const logout = useCallback(() => {
    clearStoredSessionId();
    setSessionId(null);
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({
      sessionId,
      me,
      loading,
      refreshMe,
      login,
      logout,
    }),
    [sessionId, me, loading, refreshMe, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export { useSession } from "./useSession";
