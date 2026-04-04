/**
 * Gemini-powered assist for POST /api/journey/assist.
 * Set GEMINI_API_KEY (see https://aistudio.google.com/apikey).
 * Optional: GEMINI_MODEL (default gemini-2.5-flash).
 */

import { GoogleGenAI, Type } from '@google/genai'

const SYSTEM_INSTRUCTION = `You are CarePilot, a healthcare navigation assistant for the public web.

Rules:
- Be concise, warm, and practical. You are not a doctor: do not diagnose or prescribe.
- For possible emergencies (chest pain, stroke symptoms, severe bleeding, trouble breathing), tell the user to call emergency services (e.g. 911) or go to the ER immediately.
- Prefer trusted public resources (maps, official hospital/clinic sites, HealthCare.gov-style info). Never ask for passwords or suggest logging in on behalf of the user.
- Use the conversation history. Short follow-ups ("?", "ok", "yes", "what next") refer to the same topic as the previous turns—do not reset to a vague "tell me your goal" reply if you already discussed hospitals, scheduling, insurance, or pharmacy. Answer the follow-up directly and keep browserSession aligned with that thread.
- Output must follow the JSON schema exactly. The browserSession describes optional guided steps and link suggestions (maps, scheduling examples, etc.)—not automated login.`

/** Same contract as planFromPatientMessage() return value. */
const assistResponseSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      description:
        'One of: care_search, scheduling, insurance, pharmacy, general — best match for the user message.',
    },
    assistantText: {
      type: Type.STRING,
      description: 'User-facing reply (plain text, can use newlines).',
    },
    browserSession: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: 'Unique id for this session, e.g. sess-abc123',
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
          description: 'Short natural-language summary of the browser-related goal.',
        },
        steps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              order: { type: Type.INTEGER },
              description: { type: Type.STRING },
              state: {
                type: Type.STRING,
                description: 'One of: done, pending, running',
              },
            },
            required: ['order', 'description', 'state'],
          },
        },
        actions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              label: { type: Type.STRING },
              url: { type: Type.STRING, description: 'https URL to open' },
            },
            required: ['id', 'label', 'url'],
          },
        },
        note: {
          type: Type.STRING,
          description: 'Optional short note for the Live actions panel.',
        },
      },
      required: ['id', 'mode', 'status', 'task', 'steps', 'actions'],
    },
  },
  required: ['intent', 'assistantText', 'browserSession'],
}

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}

function defaultModel() {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
}

/** Max prior turns to send (user+assistant pairs); keeps latency and cost reasonable. */
const MAX_HISTORY_MESSAGES = 24

/**
 * Build multi-turn contents for Gemini. `history` is prior messages only (excludes current user turn).
 * @param {string} message - Current user message
 * @param {Array<{ role?: string, text?: string }>} [history]
 */
export function buildGeminiContents(message, history) {
  const trimmed = String(message ?? '').trim()
  const contents = []
  const slice = Array.isArray(history) ? history.slice(-MAX_HISTORY_MESSAGES) : []
  for (const h of slice) {
    if (!h || typeof h.text !== 'string' || !h.text.trim()) continue
    const role = h.role === 'assistant' ? 'model' : 'user'
    contents.push({ role, parts: [{ text: h.text.trim() }] })
  }
  contents.push({ role: 'user', parts: [{ text: trimmed }] })
  return contents
}

/** Exported for unit tests. */
export function normalizeAssistPayload(parsed) {
  const intent = typeof parsed.intent === 'string' ? parsed.intent : 'general'
  const assistantText =
    typeof parsed.assistantText === 'string' && parsed.assistantText.trim()
      ? parsed.assistantText.trim()
      : 'Here is what I suggest next.'

  const raw = parsed.browserSession && typeof parsed.browserSession === 'object'
    ? parsed.browserSession
    : {}

  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `sess-${Date.now().toString(36)}`

  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((s, i) => ({
        order: Number.isFinite(s?.order) ? s.order : i + 1,
        description: typeof s?.description === 'string' ? s.description : '',
        state: typeof s?.state === 'string' ? s.state : 'pending',
      }))
    : []

  const actions = Array.isArray(raw.actions)
    ? raw.actions.map((a, i) => ({
        id: typeof a?.id === 'string' && a.id ? a.id : `action-${i}`,
        label: typeof a?.label === 'string' ? a.label : 'Open link',
        url: typeof a?.url === 'string' && /^https?:\/\//i.test(a.url) ? a.url : 'https://www.google.com/maps/',
      }))
    : []

  return {
    intent,
    assistantText,
    browserSession: {
      id,
      mode: typeof raw.mode === 'string' && raw.mode ? raw.mode : 'gemini',
      status: typeof raw.status === 'string' && raw.status ? raw.status : 'preview',
      task: typeof raw.task === 'string' && raw.task.trim() ? raw.task.trim() : 'Help the user with their healthcare navigation goal',
      steps,
      actions,
      ...(typeof raw.note === 'string' && raw.note.trim() ? { note: raw.note.trim() } : {}),
    },
  }
}

/**
 * @param {string} message
 * @param {Array<{ role?: string, text?: string }>} [history] - Prior chat turns (user + assistant), oldest first
 * @returns {Promise<{ intent: string, assistantText: string, browserSession: object }>}
 */
export async function assistWithGemini(message, history) {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const ai = new GoogleGenAI({ apiKey })

  const contents = buildGeminiContents(message, history)

  const response = await ai.models.generateContent({
    model: defaultModel(),
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: assistResponseSchema,
    },
  })

  const text = response.text
  if (!text?.trim()) {
    throw new Error('Empty response from Gemini')
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Gemini returned non-JSON text')
  }

  return normalizeAssistPayload(parsed)
}
