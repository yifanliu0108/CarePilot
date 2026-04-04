/**
 * Browser Use Cloud — https://cloud.browser-use.com/
 * API: https://docs.cloud.browser-use.com/cloud/api-reference
 * Key: https://cloud.browser-use.com/settings (tab API keys), env BROWSER_USE_API_KEY
 */

const CLOUD_BASE = 'https://api.browser-use.com/api/v3'

export function cloudConfigured() {
  return Boolean(process.env.BROWSER_USE_API_KEY?.trim())
}

function headers() {
  const key = process.env.BROWSER_USE_API_KEY?.trim()
  if (!key) {
    const err = new Error('Set BROWSER_USE_API_KEY (from Browser Use Cloud settings)')
    err.statusCode = 503
    throw err
  }
  return {
    'Content-Type': 'application/json',
    'X-Browser-Use-API-Key': key,
  }
}

/**
 * @param {string} task - Natural-language browser task
 * @param {{ model?: string }} [opts]
 */
export async function createCloudSession(task, opts = {}) {
  const body = {
    task,
    ...(opts.model ? { model: opts.model } : {}),
  }
  const res = await fetch(`${CLOUD_BASE}/sessions`, {
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
  return data
}

/**
 * @param {string} sessionId - UUID from createCloudSession
 */
export async function getCloudSession(sessionId) {
  const res = await fetch(`${CLOUD_BASE}/sessions/${encodeURIComponent(sessionId)}`, {
    headers: headers(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.message ?? `Cloud API ${res.status}`)
    err.statusCode = res.status
    throw err
  }
  return data
}
