/**
 * Browser Use Cloud — https://cloud.browser-use.com/
 * REST **v2** (tasks API): https://docs.browser-use.com/cloud/api-v2-overview
 * Models / options: https://docs.browser-use.com/cloud/legacy/agent
 *
 * The v3 client uses POST /sessions; v2 agent runs use POST /tasks + GET /tasks/:id
 * (see browser-use-sdk: DEFAULT_BASE_URL api/v2, Tasks.create).
 *
 * Set **one** of in `backend/.env`:
 * - `BROWSER_USE_API_KEY` (preferred)
 * - `BROWSER_USE_CLOUD_API_KEY` (alias)
 *
 * Optional:
 * - `BROWSER_USE_FLASH_MODE=false` — disable faster, less careful navigation (default: on for v2)
 * - `BROWSER_USE_LLM` — e.g. `browser-use-llm` or `gemini-flash-lite-latest` (cheaper/faster models)
 */

const CLOUD_BASE = 'https://api.browser-use.com/api/v2'

/**
 * Resolved API key (trimmed). Empty if unset.
 */
export function getBrowserUseApiKey() {
  const primary = process.env.BROWSER_USE_API_KEY?.trim()
  const alias = process.env.BROWSER_USE_CLOUD_API_KEY?.trim()
  return primary || alias || ''
}

export function cloudConfigured() {
  return Boolean(getBrowserUseApiKey())
}

function headers() {
  const key = getBrowserUseApiKey()
  if (!key) {
    const err = new Error(
      'Set BROWSER_USE_API_KEY in backend/.env (Browser Use Cloud → Settings → API keys). Optional alias: BROWSER_USE_CLOUD_API_KEY',
    )
    err.statusCode = 503
    throw err
  }
  return {
    'Content-Type': 'application/json',
    'X-Browser-Use-API-Key': key,
  }
}

function envFlashModeDefaultOn() {
  const v = process.env.BROWSER_USE_FLASH_MODE?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

/**
 * Map Browser Use v2 task payload to the shape the CarePilot UI expects (same fields as v3 sessions).
 * @param {Record<string, unknown>} raw
 */
export function normalizeCloudTaskView(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const steps = Array.isArray(raw.steps) ? raw.steps : []
  const last = steps[steps.length - 1]
  let lastSummary = null
  if (last && typeof last === 'object') {
    const s = /** @type {Record<string, unknown>} */ (last)
    const pick =
      s.next_goal ?? s.nextGoal ?? s.description ?? s.summary ?? s.title ?? null
    lastSummary = typeof pick === 'string' ? pick : null
  }
  const live =
    raw.liveUrl ??
    raw.live_url ??
    raw.browserLiveUrl ??
    raw.browser_live_url ??
    null
  const out = {
    ...raw,
    id: String(raw.id ?? ''),
    status: String(raw.status ?? ''),
    liveUrl: typeof live === 'string' ? live : null,
    lastStepSummary:
      (typeof raw.lastStepSummary === 'string' && raw.lastStepSummary) ||
      (typeof raw.last_step_summary === 'string' && raw.last_step_summary) ||
      lastSummary,
    stepCount: Number(raw.stepCount ?? raw.step_count ?? steps.length),
    output: raw.output ?? null,
    isTaskSuccessful: (raw.isTaskSuccessful ?? raw.is_task_successful) ?? null,
  }
  return out
}

/**
 * @param {string} task - Natural-language browser task
 * @param {{ model?: string }} [opts]
 */
export async function createCloudSession(task, opts = {}) {
  const llmFromEnv = process.env.BROWSER_USE_LLM?.trim()
  const body = {
    task,
    ...(opts.model ? { llm: opts.model } : {}),
    ...(llmFromEnv && !opts.model ? { llm: llmFromEnv } : {}),
    ...(envFlashModeDefaultOn() ? { flash_mode: true } : {}),
  }
  const res = await fetch(`${CLOUD_BASE}/tasks`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(
      data?.detail ? JSON.stringify(data.detail) : `Cloud API ${res.status}: ${JSON.stringify(data)}`,
    )
    err.statusCode = res.status
    throw err
  }
  return normalizeCloudTaskView(data)
}

/**
 * @param {string} taskId - Task id from createCloudSession (opaque id for polling)
 */
export async function getCloudSession(taskId) {
  const res = await fetch(`${CLOUD_BASE}/tasks/${encodeURIComponent(taskId)}`, {
    headers: headers(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.message ?? `Cloud API ${res.status}`)
    err.statusCode = res.status
    throw err
  }
  return normalizeCloudTaskView(data)
}
