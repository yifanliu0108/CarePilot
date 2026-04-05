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
 * - `BROWSER_USE_LLM` — override the default fast model (default below if unset)
 *
 * Speed (defaults tuned for lower latency / cost per step):
 * - Default LLM is `browser-use-llm` (lighter than Browser Use 2.0). Set `BROWSER_USE_LLM` to override.
 * - `flash_mode` defaults on (disable with BROWSER_USE_FLASH_MODE=false).
 * - Grocery: set `BROWSER_USE_GROCERY_FAST=1` to scan fewer chains (see groceryCloudTask.js).
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

/** Lighter model = fewer $/step and usually faster turns (see legacy agent docs). */
const DEFAULT_FAST_LLM = 'browser-use-llm'

function resolveTaskLlm(opts = {}) {
  const fromRoute = opts.model && String(opts.model).trim()
  const fromEnv = process.env.BROWSER_USE_LLM?.trim()
  return fromRoute || fromEnv || DEFAULT_FAST_LLM
}

/** v2 task terminal states (differs from v3 sessions, which use `idle` when done). */
const V2_TASK_TERMINAL = new Set([
  'finished',
  'stopped',
  'failed',
  'error',
  'completed',
  'cancelled',
  'canceled',
  'timed_out',
])

/**
 * @param {Record<string, unknown>} raw
 */
function pickTaskStatus(raw) {
  const candidates = [
    raw.status,
    raw.state,
    raw.task_status,
    raw.taskStatus,
    raw.lifecycle_status,
    raw.lifecycleStatus,
  ]
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim()
  }
  return 'pending'
}

/**
 * @param {string} status
 */
function v2TaskStillRunning(status) {
  const s = (status || '').trim().toLowerCase()
  if (!s) return true
  return !V2_TASK_TERMINAL.has(s)
}

/**
 * Map Browser Use v2 task payload to the shape the CarePilot UI expects (same fields as v3 sessions).
 * Adds `stillRunning` so the client does not mis-poll (v2/v3 status strings differ; v3 uses `idle` when done).
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
  const statusNorm = pickTaskStatus(raw)
  const stepCount = Number(raw.stepCount ?? raw.step_count ?? steps.length)
  const out = {
    ...raw,
    id: String(raw.id ?? ''),
    status: statusNorm,
    liveUrl: typeof live === 'string' ? live : null,
    lastStepSummary:
      (typeof raw.lastStepSummary === 'string' && raw.lastStepSummary) ||
      (typeof raw.last_step_summary === 'string' && raw.last_step_summary) ||
      lastSummary,
    stepCount,
    output: raw.output ?? null,
    isTaskSuccessful: (raw.isTaskSuccessful ?? raw.is_task_successful) ?? null,
    stillRunning: v2TaskStillRunning(statusNorm),
  }
  return out
}

/**
 * @param {string} task - Natural-language browser task
 * @param {{ model?: string }} [opts]
 */
export async function createCloudSession(task, opts = {}) {
  const body = {
    task,
    llm: resolveTaskLlm(opts),
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
