const SESSION_KEY = "carepilot_session_id";

/**
 * API origin for production when the UI and backend are on different hosts (e.g. two Railway services).
 * Set at build time: VITE_API_BASE_URL=https://carepilot-backend.up.railway.app (no trailing slash).
 * Omit for same-origin: dev Vite proxy or single server serving SPA + /api.
 */
export function apiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const base = typeof raw === "string" ? raw.trim().replace(/\/$/, "") : "";
  if (!path) return base || "/";
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

export function getStoredSessionId(): string | null {
  try {
    const v = localStorage.getItem(SESSION_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setStoredSessionId(id: string) {
  localStorage.setItem(SESSION_KEY, id);
}

export function clearStoredSessionId() {
  localStorage.removeItem(SESSION_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const sessionId = getStoredSessionId();
  const headers = new Headers(init.headers);
  if (sessionId) headers.set("X-Session-Id", sessionId);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(apiUrl(path), { ...init, headers });
}
