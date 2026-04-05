import "./loadEnv.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  cloudConfigured,
  createCloudSession,
  getCloudSession,
} from "./browserUseCloud.js";
import { buildCarePlacesTask } from "./careCloudTask.js";
import { buildGroceryPriceTask } from "./groceryCloudTask.js";
import {
  assistWithGemini,
  assistWithGeminiNutrition,
  geminiConfigured,
  geminiKeyDiagnostics,
} from "./geminiAssist.js";
import { formatGeminiErrorForClient } from "./geminiRetry.js";
import { ragDisabledByEnv, ragFeatureEnabled } from "./rag/rag.js";
import { planFromPatientMessage } from "./planFromPatientMessage.js";
import { nutritionAssist } from "./nutritionAssist.js";
import { buildMealPlanForApi } from "./mealPlan.js";
import { mergeStoredChatMealContext } from "./mealPlanFromChat.js";
import { createSession, getSession, updateProfile } from "./sessionStore.js";
import { computeBmi } from "./profileDefaults.js";
import {
  geocodeAddress,
  nearbyGrocery,
  placesConfigured,
  searchCareFacilities,
} from "./googlePlaces.js";

const app = express();
const PORT = process.env.PORT ?? 3001;
/**
 * Railway/Docker: bind 0.0.0.0 so the platform can reach the process.
 * Some hosts set HOST=localhost — that only accepts loopback and breaks health checks.
 */
const rawHost = process.env.HOST?.trim();
const HOST =
  !rawHost || rawHost === "localhost" || rawHost === "127.0.0.1"
    ? "0.0.0.0"
    : rawHost;

/** Local dev + optional production origins (comma-separated), e.g. https://myapp.fly.dev */
const corsOrigins = process.env.CORS_ORIGINS?.trim()
  ? process.env.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  : [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ];

app.use(
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  }),
);
app.use(express.json());

function sessionIdFromReq(req) {
  const h = req.headers["x-session-id"];
  if (typeof h === "string" && h.trim()) return h.trim();
  if (typeof req.body?.sessionId === "string" && req.body.sessionId.trim())
    return req.body.sessionId.trim();
  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "carepilot-backend",
    geminiConfigured: geminiConfigured(),
    geminiKey: geminiKeyDiagnostics(),
    ragEnabled: ragFeatureEnabled(),
    /** When true, RAG_DISABLED is set — embeddings/retrieval are off; chat still uses Gemini. */
    ragDisabledByEnv: ragDisabledByEnv(),
    browserUseConfigured: cloudConfigured(),
    placesConfigured: placesConfigured(),
  });
});

app.post("/api/auth/login", (req, res) => {
  const username = req.body?.username;
  const email = req.body?.email;
  if (typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "username (non-empty string) required" });
    return;
  }
  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "email (non-empty string) required" });
    return;
  }
  const sessionId = createSession(username, email);
  res.json({ sessionId, username: username.trim(), email: email.trim() });
});

app.get("/api/me", (req, res) => {
  const sessionId = sessionIdFromReq(req);
  const s = getSession(sessionId);
  if (!s) {
    res.status(401).json({ error: "invalid or missing session" });
    return;
  }
  res.json({
    username: s.username,
    email: s.email,
    profile: s.profile,
  });
});

app.put("/api/me/profile", (req, res) => {
  const sessionId = sessionIdFromReq(req);
  const s = getSession(sessionId);
  if (!s) {
    res.status(401).json({ error: "invalid or missing session" });
    return;
  }
  const b = req.body ?? {};
  const age =
    typeof b.age === "number" && Number.isFinite(b.age)
      ? Math.max(0, Math.min(130, b.age))
      : null;
  const heightCm =
    typeof b.heightCm === "number" && Number.isFinite(b.heightCm)
      ? Math.max(30, Math.min(260, b.heightCm))
      : null;
  const weightKg =
    typeof b.weightKg === "number" && Number.isFinite(b.weightKg)
      ? Math.max(1, Math.min(400, b.weightKg))
      : null;
  let bmi = typeof b.bmi === "number" && Number.isFinite(b.bmi) ? b.bmi : null;
  const computed = computeBmi(heightCm, weightKg);
  if (computed != null) bmi = computed;

  function parseRating(v) {
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    const x = Math.round(n);
    if (x < 1 || x > 5) return null;
    return x;
  }

  /** @param {unknown} v */
  function parseSymptomTagIds(v) {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (const x of v) {
      if (typeof x !== "string") continue;
      const t = x.trim().slice(0, 64);
      if (t.length) out.push(t);
      if (out.length >= 48) break;
    }
    return out;
  }

  /** @param {unknown} v @param {number} max */
  function parseOptionalTrimmedString(v, max) {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v !== "string") return null;
    const t = v.trim().slice(0, max);
    return t.length ? t : null;
  }

  const patch = {
    age,
    heightCm,
    weightKg,
    bmi,
    sleepRating: parseRating(b.sleepRating),
    cognitiveRating: parseRating(b.cognitiveRating),
    digestiveRating: parseRating(b.digestiveRating),
    musculoskeletalRating: parseRating(b.musculoskeletalRating),
    immuneRating: parseRating(b.immuneRating),
    completedOnboarding: Boolean(b.completedOnboarding),
  };
  if (b.symptomTagIds !== undefined) {
    patch.symptomTagIds = parseSymptomTagIds(b.symptomTagIds);
  } else {
    patch.symptomTagIds = s.profile.symptomTagIds ?? [];
  }
  if (b.displayName !== undefined) {
    patch.displayName = parseOptionalTrimmedString(b.displayName, 80);
  }
  if (b.healthFocus !== undefined) {
    patch.healthFocus = parseOptionalTrimmedString(b.healthFocus, 500);
  }
  if (b.conditionsSummary !== undefined) {
    patch.conditionsSummary = parseOptionalTrimmedString(b.conditionsSummary, 500);
  }
  if (b.visitLabSummary !== undefined) {
    patch.visitLabSummary = parseOptionalTrimmedString(b.visitLabSummary, 1200);
  }
  const profile = updateProfile(sessionId, patch);
  res.json({ profile });
});

app.get("/api/me/meal-plan", (req, res) => {
  const sessionId = sessionIdFromReq(req);
  const s = getSession(sessionId);
  if (!s) {
    res.status(401).json({ error: "invalid or missing session" });
    return;
  }
  res.json(buildMealPlanForApi(s.profile));
});

/** Whether Browser Use Cloud API key is set (never expose the key to the client). */
app.get("/api/journey/cloud-status", (_req, res) => {
  res.json({ configured: cloudConfigured() });
});

/** Whether Gemini API key is set (never expose the key to the client). */
app.get("/api/journey/gemini-status", (_req, res) => {
  res.json({ configured: geminiConfigured() });
});

/** Whether Google Maps Platform key is set (server-side; never expose the key). */
app.get("/api/journey/places-status", (_req, res) => {
  res.json({ configured: placesConfigured() });
});

app.post("/api/places/geocode", async (req, res) => {
  if (!placesConfigured()) {
    res.status(503).json({ error: "GOOGLE_MAPS_API_KEY not configured on server" });
    return;
  }
  const address = req.body?.address;
  if (typeof address !== "string" || !address.trim()) {
    res.status(400).json({ error: "body.address (non-empty string) required" });
    return;
  }
  try {
    const r = await geocodeAddress(address.trim());
    res.json(r);
  } catch (e) {
    const status =
      e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
    res.status(status).json({ error: e.message ?? "Geocoding failed" });
  }
});

app.post("/api/places/nearby-grocery", async (req, res) => {
  if (!placesConfigured()) {
    res.status(503).json({ error: "GOOGLE_MAPS_API_KEY not configured on server" });
    return;
  }
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "body.lat and body.lng (numbers) required" });
    return;
  }
  const rm = req.body?.radiusMeters;
  try {
    const r = await nearbyGrocery(lat, lng, {
      radiusMeters: typeof rm === "number" && Number.isFinite(rm) ? rm : undefined,
    });
    res.json(r);
  } catch (e) {
    const status =
      e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
    res.status(status).json({ error: e.message ?? "Nearby grocery search failed" });
  }
});

app.post("/api/places/care-facilities", async (req, res) => {
  if (!placesConfigured()) {
    res.status(503).json({ error: "GOOGLE_MAPS_API_KEY not configured on server" });
    return;
  }
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "body.lat and body.lng (numbers) required" });
    return;
  }
  const raw = req.body?.intent;
  const intent =
    raw === "urgent" || raw === "hospital" || raw === "emergency" ? raw : "emergency";
  try {
    const r = await searchCareFacilities(lat, lng, intent);
    res.json(r);
  } catch (e) {
    const status =
      e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
    res.status(status).json({ error: e.message ?? "Care facility search failed" });
  }
});

/**
 * Start a Browser Use Cloud **v2** agent task (POST …/api/v2/tasks). Poll GET …/cloud-task/:id.
 * Body: { task: string, model?: string } — maps to v2 `llm` — or —
 * { grocery: ... } | { care: { userMessage?, context? } } | { task: string }
 */
app.post("/api/journey/cloud-task", async (req, res) => {
  const g = req.body?.grocery;
  const care = req.body?.care;
  let task;
  if (g && typeof g === "object") {
    task = buildGroceryPriceTask({
      userMessage: typeof g.userMessage === "string" ? g.userMessage : "",
      priceCheckItems: Array.isArray(g.priceCheckItems)
        ? g.priceCheckItems
        : [],
      nutritionSummary:
        typeof g.nutritionSummary === "string" ? g.nutritionSummary : "",
      nearbyStoreHints: Array.isArray(g.nearbyStoreHints)
        ? g.nearbyStoreHints.map((x) => String(x ?? "").trim()).filter(Boolean)
        : [],
    });
  } else if (care && typeof care === "object") {
    task = buildCarePlacesTask({
      userMessage: typeof care.userMessage === "string" ? care.userMessage : "",
      context: typeof care.context === "string" ? care.context : "",
    });
  } else if (typeof req.body?.task === "string" && req.body.task.trim()) {
    task = req.body.task.trim();
  } else {
    res.status(400).json({
      error:
        "body.task (non-empty string) required, or body.grocery (prices), or body.care (hospitals / urgent care)",
    });
    return;
  }
  try {
    const session = await createCloudSession(task, {
      model: typeof req.body?.model === "string" ? req.body.model : undefined,
    });
    res.json(session);
  } catch (e) {
    const status =
      e.statusCode && e.statusCode >= 400 && e.statusCode < 600
        ? e.statusCode
        : 500;
    res.status(status).json({ error: e.message ?? "Cloud request failed" });
  }
});

app.get("/api/journey/cloud-task/:sessionId", async (req, res) => {
  try {
    const session = await getCloudSession(req.params.sessionId);
    res.json(session);
  } catch (e) {
    const status =
      e.statusCode && e.statusCode >= 400 && e.statusCode < 600
        ? e.statusCode
        : 500;
    res.status(status).json({ error: e.message ?? "Cloud request failed" });
  }
});

/**
 * Journey assist: nutrition (default) or care navigation.
 * Body: { message, mode?: "nutrition" | "care", history?, sessionId? }
 * — care + GEMINI_API_KEY uses Gemini with optional chat history; else mock planner.
 */
app.post("/api/journey/assist", async (req, res) => {
  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "body.message (non-empty string) required" });
    return;
  }
  const mode = req.body?.mode === "care" ? "care" : "nutrition";
  const sid = sessionIdFromReq(req);
  const session = sid ? getSession(sid) : null;
  const profile = session?.profile ?? null;

  /** @type {Array<{ role: string, text: string }>} */
  let history = [];
  const raw = req.body?.history;
  if (Array.isArray(raw)) {
    history = raw
      .filter((h) => h && typeof h.text === "string" && h.text.trim())
      .map((h) => ({
        role: h.role === "assistant" ? "assistant" : "user",
        text: h.text.trim(),
      }));
  }

  const userContextSession =
    session != null
      ? { username: session.username, profile }
      : null;

  try {
    if (mode === "care") {
      if (geminiConfigured()) {
        try {
          const plan = await assistWithGemini(message, history, userContextSession);
          res.json(plan);
          return;
        } catch (e) {
          console.error("Gemini assist failed:", e?.message ?? e);
          const timedOut = e && typeof e === "object" && e.name === "AbortError";
          res.status(503).json({
            error: timedOut
              ? "Request timed out"
              : formatGeminiErrorForClient(e),
            detail: timedOut
              ? "Try a shorter message or raise GEMINI_REQUEST_TIMEOUT_MS in backend/.env."
              : "Fix the API key/model or try again; mock planner is not used when GEMINI_API_KEY is set.",
          });
          return;
        }
      }
      const plan = planFromPatientMessage(message);
      res.json(plan);
      return;
    }
    if (geminiConfigured()) {
      try {
        const plan = await assistWithGeminiNutrition(
          message,
          history,
          userContextSession,
        );
        if (sid && plan.mealPlanUpdate?.apply) {
          const { apply: _a, ...rest } = plan.mealPlanUpdate;
          const prev = getSession(sid)?.profile?.chatMealPlanContext ?? null;
          const merged = mergeStoredChatMealContext(prev, rest);
          if (merged) updateProfile(sid, { chatMealPlanContext: merged });
        }
        res.json(plan);
        return;
      } catch (e) {
        console.error("Gemini nutrition assist failed:", e?.message ?? e);
        const timedOut = e && typeof e === "object" && e.name === "AbortError";
        res.status(503).json({
          error: timedOut
            ? "Request timed out"
            : formatGeminiErrorForClient(e),
          detail: timedOut
            ? "Try a shorter message or raise GEMINI_REQUEST_TIMEOUT_MS in backend/.env."
            : "Fix the API key/model or try again; mock nutrition planner is not used when GEMINI_API_KEY is set.",
        });
        return;
      }
    }
    const plan = nutritionAssist(message, profile, history);
    if (sid && plan.mealPlanUpdate?.apply) {
      const { apply: _a, ...rest } = plan.mealPlanUpdate;
      const prev = getSession(sid)?.profile?.chatMealPlanContext ?? null;
      const merged = mergeStoredChatMealContext(prev, rest);
      if (merged) updateProfile(sid, { chatMealPlanContext: merged });
    }
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: e?.message ?? "Assist failed" });
  }
});

/** Built Vite app (production). Override with STATIC_DIST=/abs/path. */
function resolveStaticDist() {
  const override = process.env.STATIC_DIST?.trim();
  if (override) return path.resolve(override);
  return path.join(__dirname, "../../frontend/dist");
}

const staticDist = resolveStaticDist();
const spaIndex = path.join(staticDist, "index.html");
if (process.env.SERVE_SPA !== "0" && existsSync(spaIndex)) {
  app.use(
    express.static(staticDist, {
      fallthrough: true,
      index: false,
    }),
  );
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(spaIndex);
  });
  console.log(`Serving SPA from ${staticDist}`);
} else {
  app.get("/", (_req, res) => {
    res.redirect(302, "/api/health");
  });
}

const server = app.listen(PORT, HOST, () => {
  console.log(`CarePilot API listening on http://${HOST}:${PORT}`);
  console.log(
    geminiConfigured()
      ? "Gemini: enabled (GEMINI_API_KEY loaded)"
      : "Gemini: disabled — copy backend/.env.example to backend/.env and set GEMINI_API_KEY",
  );
  console.log(
    cloudConfigured()
      ? "Browser Use Cloud: enabled (BROWSER_USE_API_KEY or BROWSER_USE_CLOUD_API_KEY)"
      : "Browser Use Cloud: disabled — set BROWSER_USE_API_KEY in backend/.env (https://cloud.browser-use.com/settings)",
  );
  console.log(
    placesConfigured()
      ? "Google Maps: enabled (GOOGLE_MAPS_API_KEY — Places + Geocoding)"
      : "Google Maps: disabled — set GOOGLE_MAPS_API_KEY in backend/.env for nearby grocery / care search",
  );
});

server.on("error", (err) => {
  if (err?.code === "EADDRINUSE") {
    console.error(
      `CarePilot API: port ${PORT} is already in use. Stop the other server on that port (e.g. \`lsof -i :${PORT}\` then kill the PID), or set PORT in backend/.env to a free port and match frontend/vite proxy if you change it.`,
    );
  } else {
    console.error(
      "CarePilot API: server failed to start:",
      err?.message ?? err,
    );
  }
  process.exit(1);
});
