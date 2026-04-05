/** v3 sessions and v2 tasks use different status strings; stop polling on terminal states only. */
const TERMINAL = new Set([
  "idle",
  "stopped",
  "timed_out",
  "error",
  "finished",
  "failed",
  "completed",
  "cancelled",
  "canceled",
]);

export function cloudStatusStillRunning(status: string) {
  const s = (status || "").trim().toLowerCase();
  if (!s) return false;
  return !TERMINAL.has(s);
}
