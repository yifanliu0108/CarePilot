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
 * - `BROWSER_USE_PROFILE_ID` — Browser Use profile UUID (cookies / logged-in sessions). See
 *   https://docs.browser-use.com/cloud/guides/authentication
 * - With a profile, `sessionSettings.proxyCountryCode` defaults to **null** (no residential proxy) so sessions
 *   synced from your machine are less likely to break. Set `BROWSER_USE_PROFILE_PROXY_US=1` to force US proxy.
 *
 * Speed (defaults tuned for lower latency / cost per step):
 * - Default LLM is `browser-use-llm` (lighter than Browser Use 2.0). Set `BROWSER_USE_LLM` to override.
 * - Flash mode defaults on (disable with BROWSER_USE_FLASH_MODE=false). Sent as `flashMode` (v2 OpenAPI).
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

/** Persistent profile UUID for tasks that need a logged-in retailer session. */
export function getBrowserUseProfileId() {
  let v = process.env.BROWSER_USE_PROFILE_ID?.trim() || ""
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim()
  }
  return v
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
  'idle',
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
  let taskId = raw.id ?? raw.taskId ?? raw.task_id
  if (
    (taskId == null || String(taskId).trim() === '') &&
    raw.task &&
    typeof raw.task === 'object'
  ) {
    const t = /** @type {Record<string, unknown>} */ (raw.task)
    taskId = t.id ?? t.taskId ?? t.task_id
  }
  const out = {
    ...raw,
    id: String(taskId ?? ''),
    status: statusNorm,
    liveUrl: typeof live === 'string' ? live : null,
    lastStepSummary:
      (typeof raw.lastStepSummary === 'string' && raw.lastStepSummary) ||
      (typeof raw.last_step_summary === 'string' && raw.last_step_summary) ||
      lastSummary,
    stepCount,
    output: raw.output ?? null,
    isTaskSuccessful:
      (raw.isTaskSuccessful ??
        raw.is_task_successful ??
        raw.isSuccess) ??
      null,
    stillRunning: v2TaskStillRunning(statusNorm),
  }
  return out
}

/**
 * v2 TaskView (and POST /tasks body) do not include liveUrl; SessionView does — GET /sessions/:id.
 * @param {Record<string, unknown>} raw
 * @returns {string | null}
 */
function pickLiveUrlFromSessionPayload(raw) {
  if (!raw || typeof raw !== 'object') return null
  const live =
    raw.liveUrl ??
    raw.live_url ??
    raw.publicShareUrl ??
    raw.public_share_url ??
    null
  return typeof live === 'string' && live.trim() !== '' ? live.trim() : null
}

/**
 * @param {string} sessionId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function fetchBrowserSession(sessionId) {
  const res = await fetch(
    `${CLOUD_BASE}/sessions/${encodeURIComponent(sessionId)}`,
    { headers: headers() },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return null
  return typeof data === 'object' && data != null ? data : null
}

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Session `liveUrl` is often null until the remote browser finishes spinning up — retry a few times.
 * @param {Record<string, unknown>} view - normalized task view
 * @param {{ liveUrlWait?: { attempts: number, delayMs: number } }} [enrichOpts]
 */
async function enrichTaskViewWithSessionLiveUrl(view, enrichOpts = {}) {
  if (!view || typeof view !== 'object') return view
  const existing = view.liveUrl
  if (typeof existing === 'string' && existing.trim() !== '') return view

  const sid = view.sessionId ?? view.session_id
  if (sid == null || String(sid).trim() === '') return view

  const w = enrichOpts.liveUrlWait ?? { attempts: 1, delayMs: 0 }
  const attempts = Math.max(1, Math.min(40, Math.floor(w.attempts)))
  const delayMs = Math.max(0, Math.min(2000, Math.floor(w.delayMs)))
  const id = String(sid).trim()

  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleepMs(delayMs)
    const session = await fetchBrowserSession(id)
    const url = session ? pickLiveUrlFromSessionPayload(session) : null
    if (url) return { ...view, liveUrl: url }
  }

  return view
}

/**
 * @param {string} task - Natural-language browser task
 * @param {{
 *   model?: string,
 *   profileId?: string,
 *   sessionSettings?: Record<string, unknown>,
 *   startUrl?: string,
 *   maxSteps?: number,
 *   highlightElements?: boolean,
 *   flashMode?: boolean,
 *   vision?: boolean | 'auto',
 * }} [opts]
 */
export async function createCloudSession(task, opts = {}) {
  const profileId =
    typeof opts.profileId === "string" && opts.profileId.trim()
      ? opts.profileId.trim()
      : getBrowserUseProfileId()

  /** @type {Record<string, unknown>} */
  const sessionSettings = {}
  if (opts.sessionSettings && typeof opts.sessionSettings === "object") {
    Object.assign(sessionSettings, opts.sessionSettings)
  }
  if (profileId) {
    sessionSettings.profileId = profileId
    if (sessionSettings.proxyCountryCode === undefined) {
      const forceUs = process.env.BROWSER_USE_PROFILE_PROXY_US?.trim() === "1"
      sessionSettings.proxyCountryCode = forceUs ? "us" : null
    }
  }

  const startUrl =
    typeof opts.startUrl === "string" && opts.startUrl.trim()
      ? opts.startUrl.trim()
      : undefined
  const maxSteps =
    typeof opts.maxSteps === "number" &&
    Number.isFinite(opts.maxSteps) &&
    opts.maxSteps >= 1
      ? Math.min(10_000, Math.floor(opts.maxSteps))
      : undefined

  /** v2 OpenAPI uses camelCase (flashMode, sessionSettings, startUrl, maxSteps, highlightElements, vision). */
  const body = {
    task,
    llm: resolveTaskLlm(opts),
    flashMode:
      typeof opts.flashMode === 'boolean'
        ? opts.flashMode
        : envFlashModeDefaultOn(),
    ...(Object.keys(sessionSettings).length > 0 ? { sessionSettings } : {}),
    ...(startUrl ? { startUrl } : {}),
    ...(maxSteps != null ? { maxSteps } : {}),
    ...(opts.highlightElements === true ? { highlightElements: true } : {}),
    ...(opts.vision !== undefined ? { vision: opts.vision } : {}),
  }
  const res = await fetch(`${CLOUD_BASE}/tasks`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail =
      data?.detail != null
        ? typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail)
        : data?.message ?? JSON.stringify(data)
    const err = new Error(`Cloud API ${res.status}: ${detail}`)
    err.statusCode = res.status
    throw err
  }
  let view = normalizeCloudTaskView(data)
  view = await enrichTaskViewWithSessionLiveUrl(
    /** @type {Record<string, unknown>} */ (view),
    { liveUrlWait: { attempts: 30, delayMs: 400 } },
  )
  return view
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
    const detail =
      data?.detail != null
        ? typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail)
        : data?.message ?? JSON.stringify(data)
    const err = new Error(`Cloud API ${res.status}: ${detail}`)
    err.statusCode = res.status
    throw err
  }
  const normalized = normalizeCloudTaskView(data)
  const still = Boolean(
    /** @type {{ stillRunning?: boolean }} */ (normalized).stillRunning,
  )
  let view = await enrichTaskViewWithSessionLiveUrl(
    /** @type {Record<string, unknown>} */ (normalized),
    still
      ? { liveUrlWait: { attempts: 4, delayMs: 400 } }
      : { liveUrlWait: { attempts: 1, delayMs: 0 } },
  )
  return view
}
