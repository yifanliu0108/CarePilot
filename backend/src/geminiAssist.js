/**
 * Gemini-powered assist for POST /api/journey/assist.
 * Set GEMINI_API_KEY (see https://aistudio.google.com/apikey).
 * Optional: GEMINI_MODEL (default gemini-2.5-flash).
 * Sampling (defaults tuned for JSON + readable reports): GEMINI_TEMPERATURE_CARE,
 * GEMINI_TEMPERATURE_NUTRITION, GEMINI_TEMPERATURE (fallback for both), GEMINI_TOP_P.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { coerceMealPlanUpdate } from "./mealPlanFromChat.js";

const SYSTEM_INSTRUCTION = `You are CarePilot, a healthcare navigation assistant for the public web.

Core rules:
- You are not a clinician: never diagnose, label a condition with certainty, or prescribe drugs or doses. Use supportive, practical navigation language.
- For possible emergencies (chest pain, stroke symptoms, severe bleeding, trouble breathing, sudden confusion, loss of consciousness), lead with: call emergency services (e.g. 911) or go to the ER now. Keep that block short and unmistakable.
- Prefer trusted public resources (government health sites, hospitals, HealthCare.gov, major medical societies). Never ask for passwords or suggest logging in on behalf of the user.
- Use the full conversation. Short follow-ups ("?", "ok", "yes", "what next") continue the same topic—do not reset to generic intake questions. Answer the follow-up directly and keep browserSession aligned with that thread.

Report style (assistantText — this is what the user reads):
- Lead with a direct answer to their latest question in 1–3 short sentences. Warm and calm, not clinical jargon.
- Then add structure: use blank lines between sections. Use short bullets (- item) for lists of options, steps, or reminders—not one dense paragraph.
- Be trustworthy: state limits honestly ("I can't examine you; if X happens, seek care"). Distinguish general education from personalized medical advice; when uncertain, say so briefly.
- Avoid hype, fear-mongering, and absolute claims. Prefer "often", "may", "consider" over "will" or "always".
- End with at most one line of standard context when helpful, e.g. that you help with finding care and resources, not replacing a clinician—without repeating long disclaimers every turn.
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
        "Main user-visible report: plain text only (no markdown #). Start with a direct answer; blank lines between sections; short bullets for lists; calm trustworthy tone; brief limits of what you can do; align with browserSession.",
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
      description: "Short phrases, max 8",
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
        "Topic label: sleep, cognitive, digestive, musculoskeletal, immune, general, or meta — best match for the user message AND conversation thread.",
    },
    mealPlanUpdate: mealPlanUpdateSchema,
  },
};

const NUTRITION_SYSTEM_INSTRUCTION_BASE = `You are CarePilot's nutrition and subhealth assistant (food patterns, wellness habits, public nutrition resources). You are not a clinician: no diagnosis, no prescribing supplements or doses as medical treatment. Prefer NIH, USDA MyPlate, Harvard Nutrition Source, eatright.org, ADA, AHA, or similar authoritative pages.

Conversation state: Read the full thread. Short user messages may rely on prior context ("what about dinner?", "my neck hurts"). Short follow-ups ("?", "ok", "yes") continue the SAME topic; do not reset to unrelated generic advice.

Report style (assistantText):
- Answer the latest question first in plain language (1–3 short sentences).
- Then organize with blank lines; use bullets for meal ideas, habits, or cautions—not a wall of text.
- Be trustworthy: separate general nutrition education from personal medical advice; encourage a clinician or registered dietitian when symptoms, pregnancy, diabetes meds, eating disorders, or allergies are in play.
- Avoid fad framing and miracle claims. Prefer balanced, evidence-aligned wording.
- Plain text only (no markdown #). Emoji only if the user used them first.

browserSession coherence: task, every steps[].description, and actions must match the user's concern. Symptom + food context (e.g. neck pain: ergonomics, anti-inflammatory patterns, red flags) stays on-topic. Do not push shopping or price workflows unless they asked.

priceCheckItems: non-empty ONLY when the user clearly wants shopping, prices, groceries, stores, or food budget help. Otherwise return priceCheckItems: [].

mealPlanUpdate: When the user mentions how they feel, symptoms, or asks for meals tailored to a concern, set apply: true. Fill symptomsMentioned (short phrases from their words). Set categoryBoosts to 1–3 values from: sleep_recovery, cognitive_focus, digestive, musculoskeletal, immune. When you can, also fill weeklyDayMeals with exactly 7 rows (Mon through Sun): each row has day, breakfast, lunch, dinner (one practical sentence each), and snacks (1–3 short strings). Those rows sync to their in-app weekly meal planner (educational ideas only). If a full week is not appropriate, still set apply true with symptoms and categoryBoosts and use an empty weeklyDayMeals array.

If asked which AI model you are, say honestly: CarePilot using Google Gemini via the app backend; the configured model id appears below. Output must follow the JSON schema; browserSession is suggested steps and https links only (no logins).`;

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
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
 * @returns {Promise<{ intent: string, assistantText: string, browserSession: object }>}
 */
export async function assistWithGemini(message, history) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const modelId = defaultModel();
  const ai = new GoogleGenAI({ apiKey });

  const contents = buildGeminiContents(message, history);

  const response = await ai.models.generateContent({
    model: modelId,
    contents,
    config: {
      systemInstruction: `${SYSTEM_INSTRUCTION}\n\nConfigured Gemini model id: ${modelId}.`,
      ...geminiSamplingConfig("care"),
      responseMimeType: "application/json",
      responseSchema: assistResponseSchema,
    },
  });

  const text = response.text;
  if (!text?.trim()) {
    throw new Error("Empty response from Gemini");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON text");
  }

  return normalizeAssistPayload(parsed);
}

/**
 * @param {object | null | undefined} profile - Session health profile (ratings, age, etc.)
 */
function nutritionProfileHint(profile) {
  if (!profile || typeof profile !== "object") return "";
  const ratings = [
    ["sleep", profile.sleepRating],
    ["cognitive", profile.cognitiveRating],
    ["digestive", profile.digestiveRating],
    ["musculoskeletal", profile.musculoskeletalRating],
    ["immune", profile.immuneRating],
  ]
    .filter(([, v]) => typeof v === "number" && v >= 1 && v <= 5)
    .map(([k, v]) => `${k}: ${v}/5`);
  const bits = [];
  if (profile.age != null && Number.isFinite(profile.age))
    bits.push(`age ${profile.age}`);
  if (ratings.length) bits.push(`focus scores ${ratings.join(", ")}`);
  if (!bits.length) return "";
  return `\nUser context (optional): ${bits.join("; ")}.`;
}

/**
 * Nutrition / subhealth chat via Gemini (same response shape as care assist).
 * @param {string} message
 * @param {Array<{ role?: string, text?: string }>} [history]
 * @param {object | null} [profile]
 */
export async function assistWithGeminiNutrition(message, history, profile) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const modelId = defaultModel();
  const systemInstruction = `${NUTRITION_SYSTEM_INSTRUCTION_BASE}\n\nConfigured Gemini model id: ${modelId}.${nutritionProfileHint(profile)}`;

  const ai = new GoogleGenAI({ apiKey });
  const contents = buildGeminiContents(message, history);

  const response = await ai.models.generateContent({
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
  if (!text?.trim()) {
    throw new Error("Empty response from Gemini");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON text");
  }

  return normalizeAssistPayload(parsed);
}
