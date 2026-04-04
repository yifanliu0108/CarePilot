import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  cloudConfigured,
  createCloudSession,
  getCloudSession,
} from "./browserUseCloud.js";
import { buildGroceryPriceTask } from "./groceryCloudTask.js";
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
  if (typeof req.body?.sessionId === "string" && req.body.sessionId.trim()) return req.body.sessionId.trim();
  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "carepilot-backend" });
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
  const age = typeof b.age === "number" && Number.isFinite(b.age) ? Math.max(0, Math.min(130, b.age)) : null;
  const heightCm =
    typeof b.heightCm === "number" && Number.isFinite(b.heightCm) ? Math.max(30, Math.min(260, b.heightCm)) : null;
  const weightKg =
    typeof b.weightKg === "number" && Number.isFinite(b.weightKg) ? Math.max(1, Math.min(400, b.weightKg)) : null;
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

/**
 * Start a task on Browser Use Cloud (https://cloud.browser-use.com/).
 * Body: { task: string, model?: string } — or —
 * { grocery: { userMessage?, priceCheckItems?, nutritionSummary? }, model?: string }
 */
app.post("/api/journey/cloud-task", async (req, res) => {
  const g = req.body?.grocery;
  let task;
  if (g && typeof g === "object") {
    task = buildGroceryPriceTask({
      userMessage: typeof g.userMessage === "string" ? g.userMessage : "",
      priceCheckItems: Array.isArray(g.priceCheckItems) ? g.priceCheckItems : [],
      nutritionSummary: typeof g.nutritionSummary === "string" ? g.nutritionSummary : "",
    });
  } else if (typeof req.body?.task === "string" && req.body.task.trim()) {
    task = req.body.task.trim();
  } else {
    res.status(400).json({
      error:
        "body.task (non-empty string) required, or body.grocery object for Walmart/Vons/Ralphs price check",
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
 * Nutrition chat + structured Browser Use–style payload.
 * Body: { message: string, sessionId?: string, mode?: "nutrition" | "care" }
 */
app.post("/api/journey/assist", (req, res) => {
  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "body.message (non-empty string) required" });
    return;
  }
  const mode = req.body?.mode === "care" ? "care" : "nutrition";
  const sid = sessionIdFromReq(req);
  const session = sid ? getSession(sid) : null;
  const profile = session?.profile ?? null;

  const plan =
    mode === "care"
      ? planFromPatientMessage(message)
      : nutritionAssist(message, profile);

  res.json(plan);
});

app.listen(PORT, () => {
  console.log(`CarePilot API listening on http://localhost:${PORT}`);
});
