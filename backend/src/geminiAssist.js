/**
 * Gemini-powered assist for POST /api/journey/assist.
 * Set GEMINI_API_KEY (see https://aistudio.google.com/apikey).
 * Optional: GEMINI_MODEL (default gemini-2.5-flash).
 * Sampling (defaults tuned for JSON + readable reports): GEMINI_TEMPERATURE_CARE,
 * GEMINI_TEMPERATURE_NUTRITION, GEMINI_TEMPERATURE (fallback for both), GEMINI_TOP_P.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { coerceMealPlanUpdate } from "./mealPlanFromChat.js";
import { normalizeGeminiApiKeyString } from "./geminiNormalizeKey.js";
import { retryAsync, isRetryableGeminiError } from "./geminiRetry.js";
import { retrieveRagContext } from "./rag/rag.js";
import { buildUserContextBlock } from "./userContextBlock.js";

const SYSTEM_INSTRUCTION = `You are CarePilot, a healthcare navigation assistant for the public web.

Core rules:
- You are not a clinician: never diagnose, label a condition with certainty, or prescribe drugs or doses. Use supportive, practical navigation language.
- For possible emergencies (chest pain, stroke symptoms, severe bleeding, trouble breathing, sudden confusion, loss of consciousness), lead with: call emergency services (e.g. 911) or go to the ER now. Keep that block short and unmistakable.
- Prefer trusted public resources (government health sites, hospitals, HealthCare.gov, major medical societies). Never ask for passwords or suggest logging in on behalf of the user.
- Use the full conversation. Short follow-ups ("?", "ok", "yes", "what next") continue the same topic—do not reset to generic intake questions. Answer the follow-up directly and keep browserSession aligned with that thread.

Report style (assistantText — this is what the user reads):
- Easy to scan: short lines, blank lines between sections, plain words. No dense walls of text.
- Lead with a direct answer to their latest question in 1–3 short sentences. Warm and calm, not clinical jargon.
- Then add structure: short bullets (- item) for options, steps, or reminders. You may cover care navigation, insurance, fitness, sleep, stress, food patterns, or other wellness angles when they help—match what they asked; do not limit yourself to one domain if broader tips fit.
- Be trustworthy: state limits honestly ("I can't examine you; if X happens, seek care"). Distinguish general education from personalized medical advice; when uncertain, say so briefly.
- Avoid hype, fear-mongering, and absolute claims. Prefer "often", "may", "consider" over "will" or "always".
- Every reply MUST end with a short block titled exactly: What's next — then 1–2 friendly follow-up questions (on their own lines, each starting with "- ") that deepen or widen the topic so the conversation keeps moving. Questions should be specific and easy to answer, not generic "anything else?"
- Optionally one short line of context that you help with navigation and resources, not replacing a clinician—without long disclaimers every turn.
- Do not use markdown headings (no #); plain text and newlines only. No emoji unless the user used them first.

browserSession:
- task, steps, actions, and optional note must match assistantText and support the same plan. Steps are scannable labels (verb-first, under ~120 characters each). Actions use clear button labels and real https URLs.
- Output must follow the JSON schema exactly. browserSession describes guided steps and link suggestions—not automated login.`;

/** Same contract as planFromPatientMessage() return value. */
const assistResponseSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      description:
        "One of: care_search, scheduling, insurance, pharmacy, general — best match for the user message.",
    },
    assistantText: {
      type: Type.STRING,
      description:
        "Main user-visible report: plain text only (no markdown #). End with a What's next section (exact heading) and 1–2 follow-up lines starting with '- '. Nutrition mode: follow the fixed layout in the system prompt (Foods to emphasize / Ease up on or Ideas to try). Care mode: direct answer, blank lines, short - bullets; align with browserSession.",
    },
    browserSession: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: "Unique id for this session, e.g. sess-abc123",
        },
        mode: {
          type: Type.STRING,
          description: 'Use the value "gemini" for API-generated plans.',
        },
        status: {
          type: Type.STRING,
          description: 'Usually "preview".',
        },
        task: {
          type: Type.STRING,
          description:
            "One-line summary of the browsing goal (8–15 words), same topic as assistantText.",
        },
        steps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              order: { type: Type.INTEGER },
              description: {
                type: Type.STRING,
                description:
                  "Single clear step; start with a verb; scannable, no filler.",
              },
              state: {
                type: Type.STRING,
                description: "One of: done, pending, running",
              },
            },
            required: ["order", "description", "state"],
          },
        },
        actions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              label: { type: Type.STRING },
              url: { type: Type.STRING, description: "https URL to open" },
            },
            required: ["id", "label", "url"],
          },
        },
        note: {
          type: Type.STRING,
          description:
            "Optional one-sentence hint for the Live panel (e.g. what to verify on a site); omit if redundant.",
        },
        priceCheckItems: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            "US grocery search phrases for a price-check tool (max 5). Use ONLY if the user asked about shopping, store prices, groceries, what to buy, or meal-prep on a budget. Otherwise return an empty array []. Never fill this for unrelated symptom chat.",
        },
      },
      required: ["id", "mode", "status", "task", "steps", "actions"],
    },
  },
  required: ["intent", "assistantText", "browserSession"],
};

const mealPlanDaySchema = {
  type: Type.OBJECT,
  properties: {
    day: { type: Type.STRING, description: "Mon, Tue, …" },
    breakfast: { type: Type.STRING },
    lunch: { type: Type.STRING },
    dinner: { type: Type.STRING },
    snacks: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["day", "breakfast", "lunch", "dinner", "snacks"],
};

const mealPlanUpdateSchema = {
  type: Type.OBJECT,
  properties: {
    apply: {
      type: Type.BOOLEAN,
      description:
        "True when user mentioned symptoms/feelings or asked for symptom-aware meals; then populate boosts and/or weekly rows.",
    },
    symptomsMentioned: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Short phrases (max ~8) summarizing concerns across the FULL chat thread, not only the last message—merge earlier turns with the latest.",
    },
    categoryBoosts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "From: sleep_recovery, cognitive_focus, digestive, musculoskeletal, immune",
    },
    weeklyDayMeals: {
      type: Type.ARRAY,
      items: mealPlanDaySchema,
      description: "Prefer exactly 7 days Mon–Sun when apply is true.",
    },
  },
};

/** Same JSON shape; intent labels are nutrition/subhealth topics. */
const nutritionAssistResponseSchema = {
  ...assistResponseSchema,
  properties: {
    ...assistResponseSchema.properties,
    intent: {
      type: Type.STRING,
      description:
        "Topic label: sleep, cognitive, digestive, musculoskeletal, immune, fitness, general, or meta — best match for the user message AND conversation thread (use fitness for movement, exercise, stretching, walking routines).",
    },
    mealPlanUpdate: mealPlanUpdateSchema,
  },
};

const NUTRITION_SYSTEM_INSTRUCTION_BASE = `You are CarePilot's wellness assistant: food and eating patterns, movement and fitness habits, sleep, stress, ergonomics, and trusted public health resources—not only meals. You are not a clinician: no diagnosis, no prescribing supplements or doses as medical treatment. For nutrition links prefer NIH, USDA MyPlate, Harvard Nutrition Source, eatright.org, ADA, AHA, or similar. For movement or general health, prefer CDC, HHS, hospital .edu rehab pages, or major medical societies.

Conversation state: Read the full thread. Short user messages may rely on prior context ("what about dinner?", "my neck hurts", "leg day ideas"). Short follow-ups ("?", "ok", "yes") continue the SAME topic; do not reset to unrelated generic advice.

Readability: Keep assistantText easy to scan—short paragraphs, blank lines between sections, simple words, lines that are not too long. Prefer bullets over dense paragraphs.

Follow-ups (required every turn): After your main content, add a section that starts on its own line with exactly: What's next
Then put 1–2 lines, each starting with "- ", each line a concrete follow-up question that moves the topic forward (deeper detail, next step, or adjacent angle—e.g. schedule, barriers, preferences). Do not end a reply without this block.

When the user mainly wants FOOD / meals / nutrition ideas, use this layout (plain text; no markdown #; emoji only if the user used them first):

1) Brief answer: 1–3 short sentences (no line may start with "- " here). Blank line.

2) On its own line, exactly: Foods to emphasize:
   Then 5–12 lines, each starting with "- " and one concrete food or simple meal/snack. Blank line after the list.

3) On one line: Ease up on: followed by a short comma-separated list of patterns, e.g. "Ease up on: large late dinners, sugary drinks."

4) Optional: one short sentence for cautions or when to see a clinician if relevant.

5) Blank line, then: What's next
   - (your follow-up questions as "- " lines)

When the user mainly wants NON-FOOD wellness (e.g. exercise, walking, stretching, sleep routine, desk ergonomics, stress breaks, hydration habits), do NOT force the Foods to emphasize / Ease up on blocks. Instead use:

1) Brief answer: 1–3 short sentences. Blank line.

2) On its own line: Ideas to try:
   Then 4–10 lines starting with "- ", mixing concrete, doable suggestions (movement, timing, environment, habits). You may include one food-related bullet only if it naturally fits.

3) Optional: one short caution or "see a clinician if" line when relevant.

4) Blank line, then: What's next
   - (your follow-up questions)

When the thread mixes food and fitness, use short subsections with blank lines between them—you may use both "Ideas to try:" and "Foods to emphasize:" if both are genuinely useful, but keep total length reasonable.

Be trustworthy: separate general education from personal medical advice; encourage an RD, PT, or clinician when symptoms, pregnancy, diabetes meds, eating disorders, sharp pain with exercise, or allergies are in play. Avoid fad framing and miracle claims.

browserSession coherence: task, every steps[].description, and actions must match the user's concern (shopping, recipes, gyms, stretches, sleep hygiene, care sites—whatever fits). Neck pain: ergonomics + gentle movement + red flags can share a plan with food only if relevant. Do not push shopping or price workflows unless they asked.

priceCheckItems: non-empty ONLY when the user clearly wants shopping, prices, groceries, stores, or food budget help. Otherwise return priceCheckItems: [].

mealPlanUpdate: When ANY turn in the thread mentions how they feel, symptoms, or asks for meals tailored to concerns, set apply: true. Synthesize symptomsMentioned and categoryBoosts from the **entire** conversation (all prior user + assistant turns in context), not just the latest user line—carry forward themes from earlier messages unless the user clearly changes topic. Set categoryBoosts to 1–3 values from: sleep_recovery, cognitive_focus, digestive, musculoskeletal, immune (use more categories if the thread clearly spans multiple). When you can, fill weeklyDayMeals with exactly 7 rows (Mon–Sun) that reflect the **combined** thread; if the user only adds a small follow-up, you may omit weeklyDayMeals so the app keeps the prior week overlay. If a full week is not appropriate, still set apply true with updated symptoms/categoryBoosts and use an empty weeklyDayMeals array.

If asked which AI model you are, say honestly: CarePilot using Google Gemini via the app backend; the configured model id appears below. Output must follow the JSON schema; browserSession is suggested steps and https links only (no logins).`;

/** Resolved key after normalize (BOM / quotes). Use for all Gemini calls. */
export function getGeminiApiKey() {
  return normalizeGeminiApiKeyString(process.env.GEMINI_API_KEY);
}

/** Safe for /api/health — never returns the secret. */
export function geminiKeyDiagnostics() {
  const k = getGeminiApiKey();
  return {
    configured: k.length > 0,
    keyLength: k.length,
    /** Google AI Studio keys usually start with AIza and are ~39 chars */
    looksLikeGoogleApiKey: /^AIza[\w-]{35,}$/.test(k),
  };
}

export function geminiConfigured() {
  return getGeminiApiKey().length > 0;
}

function defaultModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

/** Lower = more consistent structured output and formatting (Gemini range 0–2). */
const GEMINI_TEMP_CARE_DEFAULT = 0.32;
/** Slightly higher than care so meal ideas stay a bit varied while staying on-schema. */
const GEMINI_TEMP_NUTRITION_DEFAULT = 0.35;
/** Nucleus sampling; lower = tighter token choice alongside temperature. */
const GEMINI_TOP_P_DEFAULT = 0.92;

/**
 * @param {"care" | "nutrition"} mode
 * @returns {{ temperature: number, topP: number }}
 */
function geminiSamplingConfig(mode) {
  const temperature =
    mode === "nutrition"
      ? resolveGeminiTemperature(
          "GEMINI_TEMPERATURE_NUTRITION",
          GEMINI_TEMP_NUTRITION_DEFAULT,
        )
      : resolveGeminiTemperature("GEMINI_TEMPERATURE_CARE", GEMINI_TEMP_CARE_DEFAULT);
  return {
    temperature,
    topP: resolveGeminiTopP(),
  };
}

/**
 * @param {string | undefined} specificKey - e.g. GEMINI_TEMPERATURE_CARE
 * @param {number} fallback
 */
function resolveGeminiTemperature(specificKey, fallback) {
  for (const key of [specificKey, "GEMINI_TEMPERATURE"]) {
    if (!key) continue;
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 2) return n;
  }
  return fallback;
}

function resolveGeminiTopP() {
  const raw = process.env.GEMINI_TOP_P?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && n <= 1) return n;
  }
  return GEMINI_TOP_P_DEFAULT;
}

/** Abort long-running generateContent calls (ms). 0 = no timeout. Default 120000. */
function geminiRequestTimeoutMs() {
  const raw = process.env.GEMINI_REQUEST_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 600000) return Math.floor(n);
  }
  return 120_000;
}

/**
 * Parse JSON from structured output; tolerate markdown fences or leading junk.
 * Exported for unit tests.
 * @param {string | undefined} raw
 */
export function parseModelJsonResponse(raw) {
  let s = String(raw ?? "").trim();
  if (!s) {
    throw new Error("Empty response from Gemini");
  }

  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/m;
  const m = s.match(fence);
  if (m) {
    s = m[1].trim();
  } else if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/m, "").trim();
  }

  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("Gemini returned non-JSON text");
  }
}

/**
 * @param {import('@google/genai').GoogleGenAI} ai
 * @param {{ model: string, contents: unknown, config: Record<string, unknown> }} request
 */
async function generateContentWithRetry(ai, request) {
  const timeoutMs = geminiRequestTimeoutMs();
  return retryAsync(
    async () => {
      const controller = new AbortController();
      const timer =
        timeoutMs > 0
          ? setTimeout(() => controller.abort(), timeoutMs)
          : null;
      try {
        return await ai.models.generateContent({
          ...request,
          config: {
            ...request.config,
            abortSignal: controller.signal,
          },
        });
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    { maxAttempts: 3, baseDelayMs: 500, isRetryable: isRetryableGeminiError },
  );
}

/** Max prior turns to send (user+assistant pairs); keeps latency and cost reasonable. */
const MAX_HISTORY_MESSAGES = 24;

/**
 * Build multi-turn contents for Gemini. `history` is prior messages only (excludes current user turn).
 * @param {string} message - Current user message
 * @param {Array<{ role?: string, text?: string }>} [history]
 */
export function buildGeminiContents(message, history) {
  const trimmed = String(message ?? "").trim();
  const contents = [];
  const slice = Array.isArray(history)
    ? history.slice(-MAX_HISTORY_MESSAGES)
    : [];
  for (const h of slice) {
    if (!h || typeof h.text !== "string" || !h.text.trim()) continue;
    const role = h.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: h.text.trim() }] });
  }
  contents.push({ role: "user", parts: [{ text: trimmed }] });
  return contents;
}

/** Exported for unit tests. */
export function normalizeAssistPayload(parsed) {
  const intent = typeof parsed.intent === "string" ? parsed.intent : "general";
  const assistantText =
    typeof parsed.assistantText === "string" && parsed.assistantText.trim()
      ? parsed.assistantText.trim()
      : "Here is what I suggest next.";

  const raw =
    parsed.browserSession && typeof parsed.browserSession === "object"
      ? parsed.browserSession
      : {};

  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `sess-${Date.now().toString(36)}`;

  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((s, i) => ({
        order: Number.isFinite(s?.order) ? s.order : i + 1,
        description: typeof s?.description === "string" ? s.description : "",
        state: typeof s?.state === "string" ? s.state : "pending",
      }))
    : [];

  const actions = Array.isArray(raw.actions)
    ? raw.actions.map((a, i) => ({
        id: typeof a?.id === "string" && a.id ? a.id : `action-${i}`,
        label: typeof a?.label === "string" ? a.label : "Open link",
        url:
          typeof a?.url === "string" && /^https?:\/\//i.test(a.url)
            ? a.url
            : "https://www.google.com/maps/",
      }))
    : [];

  const priceCheckItems = Array.isArray(raw.priceCheckItems)
    ? raw.priceCheckItems
        .filter((x) => typeof x === "string" && x.trim())
        .slice(0, 8)
    : [];

  const base = {
    intent,
    assistantText,
    browserSession: {
      id,
      mode: typeof raw.mode === "string" && raw.mode ? raw.mode : "gemini",
      status:
        typeof raw.status === "string" && raw.status ? raw.status : "preview",
      task:
        typeof raw.task === "string" && raw.task.trim()
          ? raw.task.trim()
          : "Help the user with their healthcare navigation goal",
      steps,
      actions,
      ...(typeof raw.note === "string" && raw.note.trim()
        ? { note: raw.note.trim() }
        : {}),
      ...(priceCheckItems.length ? { priceCheckItems } : {}),
    },
  };

  const mpu = parsed.mealPlanUpdate;
  if (mpu && typeof mpu === "object") {
    const coerced = coerceMealPlanUpdate(mpu);
    if (coerced) {
      base.mealPlanUpdate = { apply: true, ...coerced };
    }
  }

  return base;
}

/**
 * @param {string} message
 * @param {Array<{ role?: string, text?: string }>} [history] - Prior chat turns (user + assistant), oldest first
 * @param {{ username?: string | null, profile?: object | null } | null} [userContextSession]
 * @returns {Promise<{ intent: string, assistantText: string, browserSession: object }>}
 */
export async function assistWithGemini(message, history, userContextSession = null) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const modelId = defaultModel();
  const ai = new GoogleGenAI({ apiKey });

  const userCtx = buildUserContextBlock(userContextSession);
  const userExtra = userCtx ? `\n\n${userCtx}` : "";

  const rag = await retrieveRagContext(ai, message, history);
  const ragExtra = rag.contextBlock ? `\n\n${rag.contextBlock}` : "";

  const contents = buildGeminiContents(message, history);

  const response = await generateContentWithRetry(ai, {
    model: modelId,
    contents,
    config: {
      systemInstruction: `${SYSTEM_INSTRUCTION}${userExtra}${ragExtra}\n\nConfigured Gemini model id: ${modelId}.`,
      ...geminiSamplingConfig("care"),
      responseMimeType: "application/json",
      responseSchema: assistResponseSchema,
    },
  });

  const text = response.text;
  const parsed = parseModelJsonResponse(text);

  const base = normalizeAssistPayload(parsed);
  if (rag.sources?.length) return { ...base, ragSources: rag.sources };
  return base;
}

/** Remind model to merge new replies with meal-plan state already saved from earlier chat turns. */
function nutritionExistingSyncHint(profile) {
  const ctx = profile?.chatMealPlanContext;
  if (!ctx || typeof ctx !== "object") return "";
  const syms = ctx.symptomsMentioned;
  const cats = ctx.categoryBoosts;
  if (!syms?.length && !cats?.length) return "";
  const parts = [];
  if (syms?.length)
    parts.push(`planner already lists: ${syms.slice(0, 8).join("; ")}`);
  if (cats?.length) parts.push(`planner nudges: ${cats.join(", ")}`);
  return `\nThis session: meal plan was previously synced from chat (${parts.join(" · ")}). Update mealPlanUpdate using the **full** message history; merge with these unless the user clearly replaces a theme.`;
}

/**
 * Nutrition / subhealth chat via Gemini (same response shape as care assist).
 * @param {string} message
 * @param {Array<{ role?: string, text?: string }>} [history]
 * @param {{ username?: string | null, profile?: object | null } | null} [userContextSession]
 */
export async function assistWithGeminiNutrition(message, history, userContextSession = null) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const profile =
    userContextSession?.profile && typeof userContextSession.profile === "object"
      ? userContextSession.profile
      : null;

  const modelId = defaultModel();
  const ai = new GoogleGenAI({ apiKey });
  const userCtx = buildUserContextBlock(userContextSession);
  const userExtra = userCtx ? `\n\n${userCtx}` : "";

  const rag = await retrieveRagContext(ai, message, history);
  const ragExtra = rag.contextBlock ? `\n\n${rag.contextBlock}` : "";

  const systemInstruction = `${NUTRITION_SYSTEM_INSTRUCTION_BASE}${userExtra}${ragExtra}\n\nConfigured Gemini model id: ${modelId}.${nutritionExistingSyncHint(profile)}`;

  const contents = buildGeminiContents(message, history);

  const response = await generateContentWithRetry(ai, {
    model: modelId,
    contents,
    config: {
      systemInstruction,
      ...geminiSamplingConfig("nutrition"),
      responseMimeType: "application/json",
      responseSchema: nutritionAssistResponseSchema,
    },
  });

  const text = response.text;
  const parsed = parseModelJsonResponse(text);

  const base = normalizeAssistPayload(parsed);
  if (rag.sources?.length) return { ...base, ragSources: rag.sources };
  return base;
}
