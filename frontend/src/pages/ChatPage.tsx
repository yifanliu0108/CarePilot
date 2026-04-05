import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/session";
import { ChatWindow } from "../components/chat/ChatWindow";
import { CloudTaskOutput } from "../components/chat/CloudTaskOutput";
import { cloudStatusStillRunning } from "../components/chat/cloudStatus";
import type { BrowserSession, CloudSessionView } from "../components/chat/journeyTypes";
import { buildRecommendationActions } from "../components/chat/recommendationActions";
import { titleForResourceLinks } from "../components/chat/resourceLinks";
import { RecommendationPanel } from "../components/chat/RecommendationPanel";
import type { ChatMessage, RecommendationAction } from "../components/chat/types";
import { assistantMessageFromApi } from "../components/chat/types";

function cloudField<T>(o: Record<string, unknown>, camel: string, snake: string): T | undefined {
  const v = o[camel] ?? o[snake];
  return v as T | undefined;
}

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

function taskFromLivePlan(live: BrowserSession, lastUserMessage: string) {
  const stepLine = live.steps.map((s) => s.description).join(" ");
  return [
    "You are helping someone explore nutrition and trusted public health resources on the web only.",
    `User said: "${lastUserMessage.slice(0, 500)}".`,
    `Goal: ${live.task}`,
    `Suggested steps: ${stepLine}`,
    "Do not log into accounts or type passwords. Prefer official nutrition and government health sites. Summarize concrete next actions.",
  ].join(" ");
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const WELCOME_TEXT =
  "Hi—I am your CarePilot nutrition assistant. Ask about foods for sleep, focus, digestion, muscles and joints, or immune support. Mention your concern or use the wording from your profile. With BROWSER_USE_API_KEY on the server, use “Check grocery prices” to run Browser Use Cloud on Walmart, Vons, and Ralphs—results may be incomplete if sites block automation.";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    assistantMessageFromApi("welcome", WELCOME_TEXT, null),
  ]);
  const [actions, setActions] = useState<RecommendationAction[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<BrowserSession | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [cloudSession, setCloudSession] = useState<CloudSessionView | null>(null);
  const [cloudActive, setCloudActive] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const lastPatientMessageRef = useRef("");
  const cloudPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const last = [...messagesRef.current].reverse().find((m) => m.role === "assistant");
    if (!last || last.role !== "assistant") return;
    setActions(buildRecommendationActions(last.text, live, cloudConfigured));
  }, [cloudConfigured, live]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    void apiFetch("/api/journey/cloud-status")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setCloudConfigured(Boolean(d.configured)))
      .catch(() => setCloudConfigured(false));
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

  async function handleBrowserUse(action: RecommendationAction) {
    console.log("Running Browser Use for:", action.label);
    await startCloudTask();
  }

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      const reply = assistantText ?? "No reply from planner.";
      const asst = assistantMessageFromApi(makeId(), reply, browserSession);
      setMessages((m) => [...m, asst]);
      if (browserSession) setLive(browserSession);
      else setLive(null);
      setActions(buildRecommendationActions(reply, browserSession ?? null, cloudConfigured));
      setCheckedIds(new Set());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setLiveError(msg);
      const errText = `Could not reach the planner (${msg}). Is the API running on port 3001?`;
      setMessages((m) => [...m, assistantMessageFromApi(makeId(), errText, null)]);
      setActions([]);
      setCheckedIds(new Set());
    } finally {
      setLiveLoading(false);
    }
  }

  const liveSummary = live ? (
    <p className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
        {live.mode} · {live.status}
      </span>
      {cloudConfigured ? (
        <span className="text-slate-500">Cloud ready</span>
      ) : (
        <span className="text-amber-700">Add BROWSER_USE_API_KEY for Cloud</span>
      )}
    </p>
  ) : liveLoading ? (
    <p className="flex items-center gap-2 text-slate-600">
      <span className="size-2 animate-pulse rounded-full bg-sky-500" aria-hidden />
      Planning…
    </p>
  ) : (
    <p className="text-slate-500">Idle — chat to generate a plan.</p>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100 lg:flex-row">
      <ChatWindow
        className="lg:min-w-0 lg:flex-[3] lg:max-w-none"
        listRef={listRef}
        messages={messages}
        draft={draft}
        setDraft={setDraft}
        onSend={() => void send()}
        liveLoading={liveLoading}
        cloudConfigured={cloudConfigured}
        liveExists={!!live}
        onCheckGroceryPrices={
          cloudConfigured && live
            ? () =>
                void handleBrowserUse({
                  id: "browseruse-grocery",
                  label: "Check grocery prices",
                  type: "browseruse",
                })
            : undefined
        }
        cloudActive={cloudActive}
      />
      <RecommendationPanel
        actions={actions}
        checkedIds={checkedIds}
        onToggle={toggleChecked}
        onBrowserUse={(a) => void handleBrowserUse(a)}
        browserUseLoading={cloudActive}
        browserUseDisabled={!live || !cloudConfigured}
        liveSummary={liveSummary}
      >
        {liveError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {liveError}
          </p>
        ) : null}
        {live?.note ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            {live.note}
          </p>
        ) : null}
        {live && live.actions.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              {titleForResourceLinks(live.actions.map((a) => a.url))}
            </p>
            <div className="flex flex-col gap-1.5">
              {live.actions.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-sky-700 underline-offset-2 hover:underline"
                >
                  {a.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}
        {cloudError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            Cloud: {cloudError}
          </p>
        ) : null}
        {cloudSession ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-slate-600">
              Session <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">{cloudSession.id.slice(0, 8)}…</code>{" "}
              · {cloudSession.status}
              {cloudSession.stepCount > 0 ? ` · ${cloudSession.stepCount} steps` : null}
            </p>
            {cloudSession.lastStepSummary ? (
              <p className="mt-2 text-xs text-slate-600">{cloudSession.lastStepSummary}</p>
            ) : null}
            {cloudSession.liveUrl ? (
              <>
                <a
                  className="mt-2 inline-block text-sm font-semibold text-sky-700 underline-offset-2 hover:underline"
                  href={cloudSession.liveUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open live browser (new tab)
                </a>
                <iframe
                  className="mt-2 h-48 w-full rounded-lg border border-slate-200"
                  title="Browser Use Cloud live view"
                  src={cloudSession.liveUrl}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </>
            ) : null}
            <CloudTaskOutput output={cloudSession.output} status={cloudSession.status} />
          </div>
        ) : null}
      </RecommendationPanel>
    </div>
  );
}
