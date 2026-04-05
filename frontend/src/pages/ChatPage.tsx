import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/session";
import { useSession } from "../context/SessionContext";
import { ChatWindow } from "../components/chat/ChatWindow";
import { CloudTaskOutput } from "../components/chat/CloudTaskOutput";
import { cloudStatusStillRunning } from "../components/chat/cloudStatus";
import type {
  BrowserSession,
  CloudSessionView,
} from "../components/chat/journeyTypes";
import { buildRecommendationActions } from "../components/chat/recommendationActions";
import { titleForResourceLinks } from "../components/chat/resourceLinks";
import { MapsLocationPanel } from "../components/chat/MapsLocationPanel";
import type { CareIntent } from "../components/chat/MapsLocationPanel";
import { RecommendationPanel } from "../components/chat/RecommendationPanel";
import { browserRunPayloadFromOutput } from "../components/chat/cloudTaskFormat";
import type { ChatMessage, RecommendationAction } from "../components/chat/types";
import {
  assistantMessageFromApi,
  assistantMessageFromBrowserRun,
  assistantMessageFromMaps,
} from "../components/chat/types";

function isCloudRunning(view: CloudSessionView): boolean {
  if (typeof view.stillRunning === "boolean") return view.stillRunning;
  return cloudStatusStillRunning(view.status);
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
    const hints = nearbyStoreHints.map((x) => x.trim()).filter(Boolean).slice(0, 12);
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
  "Hi! I'm your CarePilot nutrition assistant\n\nAsk about food for sleep, focus, digestion, muscles/joints, or immunity. Share your symptoms or use your profile to get a meal plan (it syncs to your weekly view when signed in).";

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
  const [mapsConfigured, setMapsConfigured] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [userLatLng, setUserLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState("");
  /** Store names from last Maps grocery search — passed to Browser Use price tasks. */
  const [nearbyGroceryPlaces, setNearbyGroceryPlaces] = useState<Array<{ name: string }>>([]);
  const [groceryMapCount, setGroceryMapCount] = useState(0);
  const [careMapCount, setCareMapCount] = useState(0);
  const [careIntent, setCareIntent] = useState<CareIntent>("emergency");
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
    void apiFetch("/api/journey/places-status")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setMapsConfigured(Boolean(d.configured)))
      .catch(() => setMapsConfigured(false));
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
    return nearbyGroceryPlaces.map((p) => p.name.trim()).filter(Boolean);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMapsError("Location is not available in this browser.");
      return;
    }
    setMapsLoading(true);
    setMapsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLatLng({ lat, lng });
        setLocationLabel(
          `Near ${lat.toFixed(4)}, ${lng.toFixed(4)} (browser location)`,
        );
        setMapsLoading(false);
      },
      (err) => {
        setMapsError(err.message || "Could not read location");
        setMapsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60_000 },
    );
  }

  async function searchAddressToCoords() {
    const q = addressInput.trim();
    if (!q) return;
    setMapsLoading(true);
    setMapsError(null);
    try {
      const res = await apiFetch("/api/places/geocode", {
        method: "POST",
        body: JSON.stringify({ address: q }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        lat?: number;
        lng?: number;
        formattedAddress?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (
        typeof data.lat !== "number" ||
        typeof data.lng !== "number" ||
        !Number.isFinite(data.lat) ||
        !Number.isFinite(data.lng)
      ) {
        throw new Error("No coordinates returned");
      }
      setUserLatLng({ lat: data.lat, lng: data.lng });
      setLocationLabel(data.formattedAddress ?? q);
    } catch (e) {
      setMapsError(e instanceof Error ? e.message : "Geocoding failed");
    } finally {
      setMapsLoading(false);
    }
  }

  async function findNearbyGroceryMaps() {
    if (!userLatLng) {
      setMapsError("Set your location first (button or address search).");
      return;
    }
    setMapsLoading(true);
    setMapsError(null);
    try {
      const res = await apiFetch("/api/places/nearby-grocery", {
        method: "POST",
        body: JSON.stringify({
          lat: userLatLng.lat,
          lng: userLatLng.lng,
          radiusMeters: 10000,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        places?: Array<{
          name: string;
          address: string;
          mapsUrl: string;
          rating?: number;
          distanceMeters?: number | null;
        }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const places = data.places ?? [];
      setNearbyGroceryPlaces(places.map((p) => ({ name: p.name })));
      setGroceryMapCount(places.length);
      const mapsPlaces = places.map((p) => ({
        name: p.name,
        address: p.address || undefined,
        mapsUrl: p.mapsUrl,
        rating: p.rating != null ? String(p.rating) : undefined,
        distanceMeters: p.distanceMeters ?? undefined,
      }));
      setMessages((m) => [
        ...m,
        assistantMessageFromMaps(makeId(), {
          kind: "maps",
          title: "Nearby grocery stores",
          subtitle:
            "Approximate distance from your search point. Open Maps to verify hours and directions.",
          mapsContext: "grocery",
          mapsPlaces,
        }),
      ]);
    } catch (e) {
      setMapsError(e instanceof Error ? e.message : "Maps request failed");
    } finally {
      setMapsLoading(false);
    }
  }

  async function findCareFacilitiesMaps() {
    if (!userLatLng) {
      setMapsError("Set your location first (button or address search).");
      return;
    }
    setMapsLoading(true);
    setMapsError(null);
    const titles: Record<CareIntent, string> = {
      emergency: "Emergency room (nearby)",
      urgent: "Urgent care (nearby)",
      hospital: "Hospitals (nearby)",
    };
    try {
      const res = await apiFetch("/api/places/care-facilities", {
        method: "POST",
        body: JSON.stringify({
          lat: userLatLng.lat,
          lng: userLatLng.lng,
          intent: careIntent,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        places?: Array<{
          name: string;
          address: string;
          mapsUrl: string;
          rating?: number;
          distanceMeters?: number | null;
        }>;
        disclaimer?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const places = data.places ?? [];
      setCareMapCount(places.length);
      const mapsPlaces = places.map((p) => ({
        name: p.name,
        address: p.address || undefined,
        mapsUrl: p.mapsUrl,
        rating: p.rating != null ? String(p.rating) : undefined,
        distanceMeters: p.distanceMeters ?? undefined,
      }));
      setMessages((m) => [
        ...m,
        assistantMessageFromMaps(makeId(), {
          kind: "maps",
          title: titles[careIntent],
          subtitle:
            "Public listings only—not medical advice. For emergencies call 911 (US).",
          mapsContext: "care",
          mapsPlaces,
          mapsDisclaimer: data.disclaimer,
        }),
      ]);
    } catch (e) {
      setMapsError(e instanceof Error ? e.message : "Maps request failed");
    } finally {
      setMapsLoading(false);
    }
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
      const msg = e instanceof Error ? e.message : "Request failed";
      setLiveError(msg);
      const errText = `Could not reach the planner (${msg}). Is the API running on port 3001?`;
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
      />
      <RecommendationPanel
        minimal={browserPanelMinimal}
        liveLoading={liveLoading}
        liveError={liveError}
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
        sidebarTop={
          <MapsLocationPanel
            configured={mapsConfigured}
            loading={mapsLoading}
            error={mapsError}
            locationLabel={locationLabel}
            onUseMyLocation={() => useMyLocation()}
            address={addressInput}
            onAddressChange={setAddressInput}
            onSearchAddress={() => void searchAddressToCoords()}
            careIntent={careIntent}
            onCareIntentChange={setCareIntent}
            onFindGrocery={() => void findNearbyGroceryMaps()}
            onFindCare={() => void findCareFacilitiesMaps()}
            groceryResultCount={groceryMapCount}
            careResultCount={careMapCount}
          />
        }
      >
        {cloudActive && !cloudSession ? (
          <div
            className="flex items-center gap-2 rounded-xl border border-cp-sage-200 bg-cp-sage-50 px-3 py-2.5 text-sm text-cp-sage-900"
            role="status"
            aria-live="polite"
          >
            <span
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-cp-sage-300 border-t-cp-dust-700"
              aria-hidden
            />
            <span className="font-medium">Connecting to Browser Use…</span>
          </div>
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
                  className="text-sm font-medium text-cp-dust-700 underline-offset-2 hover:underline"
                >
                  {a.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}
        {cloudError ? (
          <p
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            role="alert"
          >
            Cloud: {cloudError}
          </p>
        ) : null}
        {cloudSession ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-slate-600">
              Task{" "}
              <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">
                {cloudSession.id.slice(0, 8)}…
              </code>
              {" · "}
              <span className="font-medium text-slate-800">
                {cloudSession.status}
              </span>
              {` · ${cloudSession.stepCount} step${cloudSession.stepCount === 1 ? "" : "s"}`}
              {isCloudRunning(cloudSession) ? (
                <span className="ml-1.5 inline-flex items-center gap-1 text-cp-dust-700">
                  <span
                    className="size-1.5 animate-pulse rounded-full bg-cp-dust-500"
                    aria-hidden
                  />
                  running
                </span>
              ) : null}
            </p>
            {cloudSession.lastStepSummary ? (
              <p className="mt-2 text-xs text-slate-600">
                {cloudSession.lastStepSummary}
              </p>
            ) : null}
            {cloudSession.liveUrl ? (
              <>
                <a
                  className="mt-2 inline-block text-sm font-semibold text-cp-dust-700 underline-offset-2 hover:underline"
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
            {!isCloudRunning(cloudSession) ? (
              <p className="mt-2 text-[11px] text-slate-500">
                A formatted copy is also in the chat thread above.
              </p>
            ) : null}
            <CloudTaskOutput
              output={cloudSession.output}
              status={cloudSession.status}
            />
          </div>
        ) : null}
      </RecommendationPanel>
    </div>
  );
}
