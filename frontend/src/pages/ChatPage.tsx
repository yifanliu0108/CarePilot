import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/session";
import { useSession } from "../context/SessionContext";
import { ChatWindow } from "../components/chat/ChatWindow";
import { computeJourneyPhase } from "../components/chat/journeyPhase";
import { CloudRunStatus } from "../components/chat/CloudRunStatus";
import { cloudStatusStillRunning } from "../components/chat/cloudStatus";
import type {
  BrowserSession,
  CloudSessionView,
} from "../components/chat/journeyTypes";
import { buildRecommendationActions } from "../components/chat/recommendationActions";
import { titleForResourceLinks } from "../components/chat/resourceLinks";
import { RecommendationPanel } from "../components/chat/RecommendationPanel";
import { browserRunPayloadFromOutput } from "../components/chat/cloudTaskFormat";
import type { RagSource } from "../components/chat/JourneyFlowStrip";
import type { ChatMessage, RecommendationAction } from "../components/chat/types";
import { assistantMessageFromApi, assistantMessageFromBrowserRun } from "../components/chat/types";
import { readNearbyGroceryStoreNames } from "../maps/nearbyStoreHintsStorage";

function isCloudRunning(view: CloudSessionView): boolean {
  if (typeof view.stillRunning === "boolean") return view.stillRunning;
  return cloudStatusStillRunning(view.status);
}

type AssistHttpError = { kind: "assist_http"; status: number; message: string };

/** User-facing copy: distinguish Gemini key errors from “backend not running”. */
function formatPlannerUserMessage(raw: string, httpStatus: number): string {
  const lower = raw.toLowerCase();
  let short = raw;
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const o = JSON.parse(raw) as { error?: { message?: string } };
      if (typeof o?.error?.message === "string") short = o.error.message;
    } catch {
      /* keep raw */
    }
  }

  const geminiKeyIssue =
    lower.includes("api key") ||
    lower.includes("api_key") ||
    (lower.includes("expired") && lower.includes("key")) ||
    lower.includes("generativelanguage") ||
    lower.includes("invalid_argument");

  if (geminiKeyIssue) {
    return `Gemini: ${short}\n\nUpdate GEMINI_API_KEY in backend/.env with a current key from https://aistudio.google.com/apikey. The backend did respond—this is a Google API key issue, not a missing server on port 3001.`;
  }

  const offline =
    httpStatus === 0 &&
    (lower.includes("failed to fetch") ||
      lower.includes("networkerror") ||
      lower.includes("load failed"));

  if (offline) {
    return `Could not reach the planner (${short}). Start the backend on port 3001 (default), or set PORT in backend/.env and match the Vite proxy.`;
  }

  return `Could not reach the planner (${short}). Is the API running on port 3001?`;
}

function cloudField<T>(
  o: Record<string, unknown>,
  camel: string,
  snake: string,
): T | undefined {
  const v = o[camel] ?? o[snake];
  return v as T | undefined;
}

function parseCloudSession(raw: Record<string, unknown>): CloudSessionView {
  const still =
    typeof raw.stillRunning === "boolean"
      ? raw.stillRunning
      : typeof raw.still_running === "boolean"
        ? raw.still_running
        : undefined;
  return {
    id: String(cloudField(raw, "id", "id") ?? ""),
    status: String(cloudField(raw, "status", "status") ?? ""),
    ...(still !== undefined ? { stillRunning: still } : {}),
    liveUrl:
      (cloudField<string | null>(raw, "liveUrl", "live_url") ?? null) || null,
    lastStepSummary:
      (cloudField<string | null>(raw, "lastStepSummary", "last_step_summary") ??
        null) ||
      null,
    stepCount: Number(cloudField(raw, "stepCount", "step_count") ?? 0),
    output: cloudField(raw, "output", "output") ?? null,
    isTaskSuccessful:
      cloudField<boolean | null>(
        raw,
        "isTaskSuccessful",
        "is_task_successful",
      ) ?? null,
  };
}

function buildCloudRequestBody(
  live: BrowserSession,
  lastUserMessage: string,
  checkedIds: Set<string>,
  sidebarActions: RecommendationAction[],
  nearbyStoreHints: string[],
): string | null {
  const groceryId = "browseruse-grocery";
  const wantGrocery = checkedIds.has(groceryId);
  const items =
    live.priceCheckItems?.filter((x) => typeof x === "string" && x.trim()) ??
    [];

  const selectedDescriptions = (live.steps ?? [])
    .filter((s) => checkedIds.has(`step-${live.id}-${s.order}`))
    .map((s) => s.description)
    .filter(Boolean);

  const selectedOrphanLabels = sidebarActions
    .filter((a) => checkedIds.has(a.id) && a.id.startsWith("task-"))
    .map((a) => a.label)
    .filter(Boolean);

  const selectedCombined = [...selectedDescriptions, ...selectedOrphanLabels];

  const careKeywords =
    /hospital|emergency|\ber\b|urgent care|nearest (emergency|hospital|er)|closest (hospital|er)/i;
  const careHint =
    selectedCombined.length > 0 &&
    careKeywords.test(`${selectedCombined.join(" ")} ${lastUserMessage}`);

  if (!wantGrocery && selectedCombined.length === 0) return null;

  if (wantGrocery && items.length > 0) {
    const nutritionSummary = [
      live.task,
      selectedCombined.length
        ? `User-selected tasks to align with: ${selectedCombined.join(" · ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    const grocery: Record<string, unknown> = {
      userMessage: lastUserMessage,
      priceCheckItems: items,
      nutritionSummary,
    };
    const hints = nearbyStoreHints.map((x) => x.trim()).filter(Boolean).slice(0, 3);
    if (hints.length) grocery.nearbyStoreHints = hints;
    return JSON.stringify({ grocery });
  }

  if (careHint) {
    return JSON.stringify({
      care: {
        userMessage: lastUserMessage,
        context: [selectedCombined.join(" | "), live.task].filter(Boolean).join("\n"),
      },
    });
  }

  const stepLine =
    selectedCombined.length > 0
      ? selectedCombined.join(" | ")
      : (live.steps ?? []).map((s) => s.description).join(" | ");

  return JSON.stringify({
    task: [
      "You are helping someone explore nutrition and trusted public health resources on the web only.",
      `User said: "${lastUserMessage.slice(0, 500)}".`,
      `Goal: ${live.task}`,
      `Focus on these user-selected tasks: ${stepLine}`,
      "Do not log into accounts or type passwords. Prefer official nutrition and government health sites. Summarize concrete next actions.",
    ].join(" "),
  });
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const WELCOME_TEXT =
  "Hi! I'm CarePilot, your wellness assistant.\n\nTell me your goal (sleep, focus, digestion, fitness, or immunity), and I'll give you a food rec and meal plan.\n\nWhen you get a plan, select the steps you want in the side panel and tap “Run selected” to execute them.";

export default function ChatPage() {
  const { refreshMe, sessionId } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([
    assistantMessageFromApi("welcome", WELCOME_TEXT, null),
  ]);
  const [actions, setActions] = useState<RecommendationAction[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const checkedIdsRef = useRef(checkedIds);
  checkedIdsRef.current = checkedIds;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<BrowserSession | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [cloudSession, setCloudSession] = useState<CloudSessionView | null>(
    null,
  );
  const [cloudActive, setCloudActive] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [journeyIntent, setJourneyIntent] = useState<string | null>(null);
  const [ragSources, setRagSources] = useState<RagSource[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const lastPatientMessageRef = useRef("");
  const cloudPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appendedCloudTaskIdsRef = useRef(new Set<string>());

  function appendCloudResultToChat(session: CloudSessionView) {
    if (!session.id || appendedCloudTaskIdsRef.current.has(session.id)) return;
    const payload = browserRunPayloadFromOutput(session.output, session.status);
    if (!payload) return;
    appendedCloudTaskIdsRef.current.add(session.id);
    setMessages((m) => [...m, assistantMessageFromBrowserRun(makeId(), payload)]);
  }

  useEffect(() => {
    const last = [...messagesRef.current]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!last || last.role !== "assistant") return;
    const built = buildRecommendationActions(last.text, live, cloudConfigured);
    setActions(built);
    setCheckedIds(new Set());
  }, [cloudConfigured, live]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    void apiFetch("/api/journey/cloud-status")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) =>
        setCloudConfigured(Boolean(d.configured)),
      )
      .catch(() => setCloudConfigured(false));
  }, []);

  useEffect(() => {
    const st = location.state as
      | { shopRecipeDraft?: string }
      | null
      | undefined;
    const draftText = st?.shopRecipeDraft;
    if (typeof draftText !== "string" || !draftText.trim()) return;
    setDraft(draftText.trim());
    navigate(location.pathname, { replace: true, state: {} });
    const raf = window.requestAnimationFrame(() => {
      document.getElementById("cp-guardian-input")?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [location.key, location.pathname, navigate]);

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

  function nearbyHintsForCloud(): string[] {
    return readNearbyGroceryStoreNames();
  }

  async function startCloudTask(options?: { forceIncludeGrocery?: boolean }) {
    if (!live) return;
    const ids = new Set(checkedIdsRef.current);
    if (options?.forceIncludeGrocery) ids.add("browseruse-grocery");
    const body = buildCloudRequestBody(
      live,
      lastPatientMessageRef.current,
      ids,
      actionsRef.current,
      nearbyHintsForCloud(),
    );
    if (!body) {
      setCloudError(
        "Select at least one step (or grocery prices, if listed), then tap Run selected.",
      );
      return;
    }
    stopCloudPoll();
    setCloudError(null);
    setCloudActive(true);
    setCloudSession(null);
    try {
      const res = await apiFetch("/api/journey/cloud-task", {
        method: "POST",
        body,
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      > & {
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
      if (!isCloudRunning(current)) {
        appendCloudResultToChat(current);
        setCloudActive(false);
        return;
      }
      const pollOnce = async () => {
        const r = await apiFetch(
          `/api/journey/cloud-task/${encodeURIComponent(sessionId)}`,
        );
        const d = (await r.json().catch(() => ({}))) as Record<
          string,
          unknown
        > & {
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
        if (!isCloudRunning(current)) {
          appendCloudResultToChat(current);
          stopCloudPoll();
          setCloudActive(false);
        }
      };
      cloudPollRef.current = setInterval(() => void pollOnce(), 2000);
      void pollOnce();
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : "Cloud task failed");
      setCloudActive(false);
    }
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
    setJourneyIntent(null);
    setRagSources(null);
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
        const errBody = data as { error?: string; detail?: string };
        const message = [errBody.error, errBody.detail].filter(Boolean).join(" ");
        throw {
          kind: "assist_http" as const,
          status: res.status,
          message: message || res.statusText,
        } satisfies AssistHttpError;
      }
      const assistantText = (data as { assistantText?: string }).assistantText;
      const browserSession = (data as { browserSession?: BrowserSession })
        .browserSession;
      const mealPlanUpdate = (
        data as { mealPlanUpdate?: { apply?: boolean } }
      ).mealPlanUpdate;
      if (mealPlanUpdate?.apply && sessionId) {
        void refreshMe();
      }
      let reply = assistantText ?? "No reply from planner.";
      if (mealPlanUpdate?.apply) {
        reply +=
          "\n\n— Your meal plan was updated from this chat. Open Meal plan in the sidebar to review the week.";
      }
      const asst = assistantMessageFromApi(makeId(), reply, browserSession);
      setMessages((m) => [...m, asst]);
      const intentRaw = (data as { intent?: string }).intent;
      setJourneyIntent(
        typeof intentRaw === "string" && intentRaw.trim()
          ? intentRaw.trim()
          : null,
      );
      if (browserSession) setLive(browserSession);
      else setLive(null);
      const nextActions = buildRecommendationActions(
        reply,
        browserSession ?? null,
        cloudConfigured,
      );
      setActions(nextActions);
      setCheckedIds(new Set());
    } catch (e) {
      setJourneyIntent(null);
      setRagSources(null);
      let msg = "Request failed";
      let status = 0;
      if (
        e &&
        typeof e === "object" &&
        "kind" in e &&
        (e as AssistHttpError).kind === "assist_http"
      ) {
        const ae = e as AssistHttpError;
        msg = ae.message;
        status = ae.status;
      } else if (e instanceof Error) {
        msg = e.message;
      }
      setLiveError(msg);
      const errText = formatPlannerUserMessage(msg, status);
      setMessages((m) => [
        ...m,
        assistantMessageFromApi(makeId(), errText, null),
      ]);
      setActions([]);
      setCheckedIds(new Set());
    } finally {
      setLiveLoading(false);
    }
  }

  const journeyPhase = computeJourneyPhase(live, cloudActive, cloudSession);

  const browserUseRunning = cloudActive || cloudSession != null;
  const browserUseReady =
    !browserUseRunning && (!!live || actions.length > 0);
  const browserPanelMinimal = !browserUseReady;

  const liveSummary = browserPanelMinimal ? undefined : live ? (
    <p className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
        {live.mode === "gemini" ? "BrowserUse" : live.mode} · {live.status}
      </span>
      {cloudConfigured ? (
        <span className="text-slate-500">Cloud ready</span>
      ) : (
        <span className="text-amber-700">
          Add BROWSER_USE_API_KEY for Cloud
        </span>
      )}
    </p>
  ) : liveLoading ? (
    <p className="flex items-center gap-2 text-slate-600">
      <span
        className="size-2 animate-pulse rounded-full bg-cp-dust-500"
        aria-hidden
      />
      Planning…
    </p>
  ) : actions.length > 0 ? (
    <p className="text-slate-500">
      <strong>Run selected</strong> becomes available when the assistant returns a browser plan.
      You can still review suggested steps below.
    </p>
  ) : (
    <p className="text-slate-500">Idle — send a message to get the next reply.</p>
  );

  return (
    <div className="cp-chat-page-root flex min-h-0 flex-1 flex-col">
      <div
        className="cp-execute-banner"
        role="region"
        aria-label="How CarePilot goes from chat to action"
      >
        <p className="cp-execute-banner__head">
          <strong>Suggest → execute</strong>
          <span className="cp-execute-banner__sep" aria-hidden>
            ·
          </span>
          <span className="cp-execute-banner__text">
            Chat for ideas, then use <strong>Recommendation</strong> → <strong>Run selected</strong> to run
            your plan in the cloud browser—not just read advice.
          </span>
        </p>
        <p className="cp-execute-banner__gemini">
          Assistant reasoning uses{" "}
          <a
            href="https://ai.google.dev/gemini-api"
            target="_blank"
            rel="noreferrer"
            className="cp-execute-banner__link"
          >
            Google Gemini
          </a>
          .
        </p>
      </div>
      <div className="cp-chat-layout cp-chat-page-bg flex min-h-0 flex-1 flex-col lg:flex-row">
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
          cloudConfigured &&
          live &&
          (live.priceCheckItems?.filter(
            (x) => typeof x === "string" && x.trim(),
          ).length ?? 0) > 0
            ? () => void startCloudTask({ forceIncludeGrocery: true })
            : undefined
        }
        cloudActive={cloudActive}
        journeyPhase={journeyPhase}
        ragSources={ragSources}
      />
      <RecommendationPanel
        minimal={browserPanelMinimal}
        liveLoading={liveLoading}
        liveError={liveError}
        plan={liveLoading ? null : live}
        planIntent={journeyIntent}
        planLoading={liveLoading}
        actions={actions}
        checkedIds={checkedIds}
        onToggle={toggleChecked}
        onRunSelected={() => void startCloudTask()}
        runLoading={cloudActive}
        runDisabled={
          !live ||
          !cloudConfigured ||
          !buildCloudRequestBody(
            live,
            lastPatientMessageRef.current,
            checkedIds,
            actions,
            nearbyHintsForCloud(),
          )
        }
        liveSummary={liveSummary}
      >
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
                  className="text-sm font-medium text-cp-dust-700 underline-offset-2 hover:underline"
                >
                  {a.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}
        <CloudRunStatus
          connecting={cloudActive && !cloudSession}
          session={cloudSession}
          error={cloudError}
          sessionRunning={cloudSession ? isCloudRunning(cloudSession) : false}
        />
      </RecommendationPanel>
      </div>
    </div>
  );
}
