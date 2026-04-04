import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import {
  cloudConfigured,
  createCloudSession,
  getCloudSession,
} from './browserUseCloud.js'
import { planFromPatientMessage } from './planFromPatientMessage.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'carepilot-backend' })
})

/** Whether Browser Use Cloud API key is set (never expose the key to the client). */
app.get('/api/journey/cloud-status', (_req, res) => {
  res.json({ configured: cloudConfigured() })
})

/**
 * Start a task on Browser Use Cloud (https://cloud.browser-use.com/).
 * Body: { task: string, model?: string } — see API v3 Create Session.
 */
app.post('/api/journey/cloud-task', async (req, res) => {
  const task = req.body?.task
  if (typeof task !== 'string' || !task.trim()) {
    res.status(400).json({ error: 'body.task (non-empty string) required' })
    return
  }
  try {
    const session = await createCloudSession(task.trim(), {
      model: typeof req.body?.model === 'string' ? req.body.model : undefined,
    })
    res.json(session)
  } catch (e) {
    const status = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500
    res.status(status).json({ error: e.message ?? 'Cloud request failed' })
  }
})

app.get('/api/journey/cloud-task/:sessionId', async (req, res) => {
  try {
    const session = await getCloudSession(req.params.sessionId)
    res.json(session)
  } catch (e) {
    const status = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500
    res.status(status).json({ error: e.message ?? 'Cloud request failed' })
  }
})

/**
 * Patient chat + structured Browser Use–style payload (mock planner).
 * Optional: after planning, call POST /api/journey/cloud-task with a concrete task string
 * to run the agent on Browser Use Cloud (hosted browsers + liveUrl).
 */
app.post('/api/journey/assist', (req, res) => {
  const message = req.body?.message
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'body.message (non-empty string) required' })
    return
  }
  const plan = planFromPatientMessage(message)
  res.json(plan)
})

app.listen(PORT, () => {
  console.log(`CarePilot API listening on http://localhost:${PORT}`)
})
