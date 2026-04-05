import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/session";

function cloudField<T>(o: Record<string, unknown>, camel: string, snake: string): T | undefined {
  const v = o[camel] ?? o[snake];
  return v as T | undefined;
}

type CloudSessionView = {
  id: string;
  status: string;
  liveUrl: string | null;
  lastStepSummary: string | null;
  stepCount: number;
  output: unknown;
  isTaskSuccessful: boolean | null;
};

function parseCloudSession(raw: Record<string, unknown>): CloudSessionView {
  return {
    id: String(cloudField(raw, "id", "id") ?? ""),
    status: String(cloudField(raw, "status", "status") ?? ""),
    liveUrl: (cloudField<string | null>(raw, "liveUrl", "live_url") ?? null) || null,
    lastStepSummary:
      (cloudField<string | null>(raw, "lastStepSummary", "last_step_summary") ?? null) || null,
    stepCount: Number(cloudField(raw, "stepCount", "step_count") ?? 0),
    output: cloudField(raw, "output", "output") ?? null,
    isTaskSuccessful:
      (cloudField<boolean | null>(raw, "isTaskSuccessful", "is_task_successful") ?? null) ?? null,
  };
}

function cloudStatusStillRunning(status: string) {
  return status === "created" || status === "idle" || status === "running";
}

type Role = "user" | "assistant";

type Message = { id: string; role: Role; text: string };

type BrowserStep = { order: number; description: string; state: string };

type BrowserAction = { id: string; label: string; url: string };

type BrowserSession = {
  id: string;
  mode: string;
  status: string;
  task: string;
  steps: BrowserStep[];
  actions: BrowserAction[];
  note?: string;
  priceCheckItems?: string[];
};

type GroceryPriceRow = { store: string; product: string; price: string; productUrl?: string };
type GroceryPriceItem = { query: string; results: GroceryPriceRow[] };

function parseGroceryCloudOutput(output: unknown): { items: GroceryPriceItem[] } | null {
  if (output == null) return null;
  if (typeof output === "object" && output !== null) {
    const o = output as { items?: unknown };
    if (Array.isArray(o.items) && o.items.length > 0) {
      return { items: o.items as GroceryPriceItem[] };
    }
  }
  if (typeof output !== "string") return null;
  let raw = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  try {
    const j = JSON.parse(raw) as { items?: GroceryPriceItem[] };
    if (j && Array.isArray(j.items) && j.items.length > 0) return { items: j.items };
  } catch {
    /* ignore */
  }
  return null;
}

function taskFromLivePlan(live: BrowserSession, lastUserMessage: string) {
  const stepLine = live.steps.map((s) => s.description).join(" ");
  return [
    "You help a generally well person with subhealth / wellness nutrition—trusted public sites only; not medical diagnosis or emergencies.",
    `User said: "${lastUserMessage.slice(0, 500)}".`,
    `Goal: ${live.task}`,
    `Suggested steps: ${stepLine}`,
    "Do not log into accounts or type passwords. Prefer official nutrition and government health sites. Summarize concrete next actions.",
  ].join(" ");
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function CloudTaskOutput({ output, status }: { output: unknown; status: string }) {
  if (output == null || cloudStatusStillRunning(status)) return null;
  const parsed = parseGroceryCloudOutput(output);
  if (parsed) {
    return (
      <div className="cp-live__grocery">
        <p className="cp-live__grocery-title">Grocery price snapshot</p>
        {parsed.items.map((row) => (
          <div key={row.query} className="cp-live__grocery-block">
            <p className="cp-live__grocery-query">{row.query}</p>
            <table className="cp-live__grocery-table">
              <thead>
                <tr>
                  <th scope="col">Store</th>
                  <th scope="col">Product</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                {(row.results ?? []).map((r, i) => (
                  <tr key={`${row.query}-${r.store}-${i}`}>
                    <td>{r.store}</td>
                    <td>
                      {r.productUrl ? (
                        <a href={r.productUrl} target="_blank" rel="noreferrer">
                          {r.product || "—"}
                        </a>
                      ) : (
                        (r.product ?? "—")
                      )}
                    </td>
                    <td>{r.price ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }
  return (
    <pre className="cp-live__output">
      {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
    </pre>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text:
        "Hi—I’m your CarePilot coach. We go past tips: use Live actions to run real browser steps you approve (e.g. research or grocery checks with Browser Use Cloud + API key). You’re not sick yet—we help you stay on track with food and habits: sleep, focus, digestion, and more. Not for emergencies. Ask anything or use your profile.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<BrowserSession | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [cloudSession, setCloudSession] = useState<CloudSessionView | null>(null);
  const [cloudActive, setCloudActive] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastPatientMessageRef = useRef("");
  const cloudPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    void apiFetch("/api/journey/cloud-status")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setCloudConfigured(Boolean(d.configured)))
      .catch(() => setCloudConfigured(false));
    void apiFetch("/api/journey/gemini-status")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setGeminiConfigured(Boolean(d.configured)))
      .catch(() => setGeminiConfigured(false));
  }, []);

  useEffect(
    () => () => {
      if (cloudPollRef.current) {
        clearInterval(cloudPollRef.current);
        cloudPollRef.current = null;
      }
    },
    [],
  );

  function stopCloudPoll() {
    if (cloudPollRef.current) {
      clearInterval(cloudPollRef.current);
      cloudPollRef.current = null;
    }
  }

  async function startCloudTask() {
    if (!live) return;
    stopCloudPoll();
    setCloudError(null);
    setCloudActive(true);
    setCloudSession(null);
    try {
      const items = live.priceCheckItems?.filter((x) => typeof x === "string" && x.trim()) ?? [];
      const body =
        items.length > 0
          ? JSON.stringify({
              grocery: {
                userMessage: lastPatientMessageRef.current,
                priceCheckItems: items,
                nutritionSummary: live.task,
              },
            })
          : JSON.stringify({ task: taskFromLivePlan(live, lastPatientMessageRef.current) });
      const res = await apiFetch("/api/journey/cloud-task", {
        method: "POST",
        body,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? res.statusText);
      }
      let current = parseCloudSession(data);
      setCloudSession(current);
      const sessionId = current.id;
      if (!sessionId) {
        throw new Error("Cloud did not return a session id");
      }
      if (!cloudStatusStillRunning(current.status)) {
        setCloudActive(false);
        return;
      }
      const pollOnce = async () => {
        const r = await apiFetch(`/api/journey/cloud-task/${encodeURIComponent(sessionId)}`);
        const d = (await r.json().catch(() => ({}))) as Record<string, unknown> & {
          error?: string;
        };
        if (!r.ok) {
          setCloudError(d.error ?? r.statusText);
          stopCloudPoll();
          setCloudActive(false);
          return;
        }
        current = parseCloudSession(d);
        setCloudSession({ ...current });
        if (!cloudStatusStillRunning(current.status)) {
          stopCloudPoll();
          setCloudActive(false);
        }
      };
      cloudPollRef.current = setInterval(() => void pollOnce(), 3000);
      void pollOnce();
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : "Cloud task failed");
      setCloudActive(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    lastPatientMessageRef.current = text;

    const history = messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((m) => [...m, { id: makeId(), role: "user", text }]);
    setLiveLoading(true);
    setLiveError(null);
    stopCloudPoll();
    setCloudSession(null);
    setCloudError(null);
    setCloudActive(false);
    try {
      const res = await apiFetch("/api/journey/assist", {
        method: "POST",
        body: JSON.stringify({ message: text, mode: "nutrition", history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? res.statusText);
      }
      const assistantText = (data as { assistantText?: string }).assistantText;
      const browserSession = (data as { browserSession?: BrowserSession }).browserSession;
      setMessages((m) => [
        ...m,
        {
          id: makeId(),
          role: "assistant",
          text: assistantText ?? "No reply from planner.",
        },
      ]);
      if (browserSession) setLive(browserSession);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setLiveError(msg);
      setMessages((m) => [
        ...m,
        {
          id: makeId(),
          role: "assistant",
          text: `Could not reach the planner (${msg}). Is the API running on port 3001?`,
        },
      ]);
    } finally {
      setLiveLoading(false);
    }
  }

  return (
    <div className="cp-journey">
      <section className="cp-chat" aria-label="Subhealth chat">
        <header className="cp-chat__head">
          <h1 className="cp-chat__title">CarePilot coach</h1>
          <p className="cp-chat__sub">
            Recommendations are table stakes—we pair them with <strong>actions</strong> you trigger in
            Live actions (Browser Use Cloud when configured). Not emergency care.{" "}
            {geminiConfigured
              ? "AI: Gemini on the server."
              : "Add GEMINI_API_KEY in backend/.env for Gemini; otherwise a simple planner."}
          </p>
        </header>
        <div className="cp-chat__messages" ref={listRef} role="log" aria-live="polite">
          {messages.map((msg) => (
            <div key={msg.id} className={"cp-bubble cp-bubble--" + msg.role}>
              {msg.text.split("\n").map((line, i) => (
                <span key={i}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="cp-chat__composer">
          <label className="visually-hidden" htmlFor="cp-chat-input">
            Message
          </label>
          <textarea
            id="cp-chat-input"
            className="cp-chat__input"
            rows={2}
            placeholder="e.g. Light meal ideas when I feel low energy after work…"
            value={draft}
            disabled={liveLoading}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            onClick={() => void send()}
            disabled={liveLoading}
          >
            {liveLoading ? "…" : "Send"}
          </button>
        </div>
      </section>
      <aside className="cp-live" aria-label="Live actions">
        <h2 className="cp-live__title">Live actions</h2>
        <p className="cp-live__sub">
          {live
            ? `${live.mode} · ${live.status}${cloudConfigured ? " · Cloud ready" : ""}`
            : cloudConfigured
              ? "Plan + Browser Use Cloud"
              : "Plan (add BROWSER_USE_API_KEY for Cloud)"}
        </p>
        <div className="cp-live__card">
          {liveError ? (
            <p className="cp-live__hint" role="alert">
              {liveError}
            </p>
          ) : null}
          {liveLoading ? (
            <div className="cp-live__status">
              <span className="cp-live__dot cp-live__dot--pulse" aria-hidden />
              Planning…
            </div>
          ) : live ? (
            <>
              <div className="cp-live__status">
                <span className="cp-live__dot cp-live__dot--on" aria-hidden />
                {live.task}
              </div>
              {live.note ? <p className="cp-live__hint">{live.note}</p> : null}
              <ol className="cp-live__steps">
                {live.steps.map((s) => (
                  <li
                    key={s.order}
                    className={
                      "cp-live__step cp-live__step--" + (s.state === "done" ? "done" : "pending")
                    }
                  >
                    <span className="cp-live__step-num">{s.order}</span>
                    {s.description}
                  </li>
                ))}
              </ol>
              {live.actions.length > 0 ? (
                <div className="cp-live__actions">
                  {live.actions.map((a) => (
                    <a
                      key={a.id}
                      className="cp-btn cp-btn--secondary cp-live__action"
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.label}
                    </a>
                  ))}
                </div>
              ) : null}
              {cloudConfigured ? (
                <div className="cp-live__cloud">
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary cp-live__action"
                    disabled={cloudActive}
                    onClick={() => void startCloudTask()}
                  >
                    {cloudActive ? "Cloud agent running…" : "Check grocery prices"}
                  </button>
                  <p className="cp-live__hint cp-live__hint--tight">
                    Uses{" "}
                    <a href="https://cloud.browser-use.com/" target="_blank" rel="noreferrer">
                      Browser Use Cloud
                    </a>{" "}
                    (your balance). Searches Walmart, Vons, and Ralphs for the suggested items; prices
                    are indicative only.
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="cp-live__status">
                <span className="cp-live__dot" aria-hidden />
                Idle
              </div>
              <p className="cp-live__hint">
                Chat first—we turn advice into a plan here. Then you run Live actions so CarePilot can
                take browser steps on your behalf (Browser Use Cloud when configured), not just list
                what you should do.
              </p>
            </>
          )}
          {cloudError ? (
            <p className="cp-live__hint cp-live__cloud-error" role="alert">
              Cloud: {cloudError}
            </p>
          ) : null}
          {cloudSession ? (
            <div className="cp-live__cloud-panel">
              <p className="cp-live__cloud-meta">
                Session <code className="cp-live__code">{cloudSession.id.slice(0, 8)}…</code> ·{" "}
                {cloudSession.status}
                {cloudSession.stepCount > 0 ? ` · ${cloudSession.stepCount} steps` : null}
              </p>
              {cloudSession.lastStepSummary ? (
                <p className="cp-live__hint">{cloudSession.lastStepSummary}</p>
              ) : null}
              {cloudSession.liveUrl ? (
                <>
                  <a
                    className="cp-live__live-link"
                    href={cloudSession.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open live browser (new tab)
                  </a>
                  <iframe
                    className="cp-live__iframe"
                    title="Browser Use Cloud live view"
                    src={cloudSession.liveUrl}
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                </>
              ) : null}
              <CloudTaskOutput output={cloudSession.output} status={cloudSession.status} />
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
