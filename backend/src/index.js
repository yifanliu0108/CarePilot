import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// npm run dev from repo root uses cwd = monorepo root; load backend/.env explicitly.
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env"), override: true });

import cors from "cors";
import express from "express";
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
} from "./geminiAssist.js";
import { planFromPatientMessage } from "./planFromPatientMessage.js";
import { nutritionAssist } from "./nutritionAssist.js";
import { buildDailyMealPlan } from "./mealPlan.js";
import { createSession, getSession, updateProfile } from "./sessionStore.js";
import { computeBmi } from "./profileDefaults.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
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
    browserUseConfigured: cloudConfigured(),
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
  res.json(buildDailyMealPlan(s.profile));
});

/** Whether Browser Use Cloud API key is set (never expose the key to the client). */
app.get("/api/journey/cloud-status", (_req, res) => {
  res.json({ configured: cloudConfigured() });
});

/** Whether Gemini API key is set (never expose the key to the client). */
app.get("/api/journey/gemini-status", (_req, res) => {
  res.json({ configured: geminiConfigured() });
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

  try {
    if (mode === "care") {
      if (geminiConfigured()) {
        try {
          const plan = await assistWithGemini(message, history);
          res.json(plan);
          return;
        } catch (e) {
          console.error("Gemini assist failed:", e?.message ?? e);
          res.status(503).json({
            error: e?.message ?? "Gemini request failed",
            detail:
              "Fix the API key/model or try again; mock planner is not used when GEMINI_API_KEY is set.",
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
        const plan = await assistWithGeminiNutrition(message, history, profile);
        res.json(plan);
        return;
      } catch (e) {
        console.error("Gemini nutrition assist failed:", e?.message ?? e);
        res.status(503).json({
          error: e?.message ?? "Gemini request failed",
          detail:
            "Fix the API key/model or try again; mock nutrition planner is not used when GEMINI_API_KEY is set.",
        });
        return;
      }
    }
    const plan = nutritionAssist(message, profile);
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: e?.message ?? "Assist failed" });
  }
});

const server = app.listen(PORT, () => {
  console.log(`CarePilot API listening on http://localhost:${PORT}`);
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
