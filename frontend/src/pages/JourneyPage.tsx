import { useEffect, useRef, useState } from 'react'

/** Cloud API may return camelCase or snake_case depending on version. */
function cloudField<T>(o: Record<string, unknown>, camel: string, snake: string): T | undefined {
  const v = o[camel] ?? o[snake]
  return v as T | undefined
}

type CloudSessionView = {
  id: string
  status: string
  liveUrl: string | null
  lastStepSummary: string | null
  stepCount: number
  output: unknown
  isTaskSuccessful: boolean | null
}

function parseCloudSession(raw: Record<string, unknown>): CloudSessionView {
  return {
    id: String(cloudField(raw, 'id', 'id') ?? ''),
    status: String(cloudField(raw, 'status', 'status') ?? ''),
    liveUrl: (cloudField<string | null>(raw, 'liveUrl', 'live_url') ?? null) || null,
    lastStepSummary:
      (cloudField<string | null>(raw, 'lastStepSummary', 'last_step_summary') ?? null) || null,
    stepCount: Number(cloudField(raw, 'stepCount', 'step_count') ?? 0),
    output: cloudField(raw, 'output', 'output') ?? null,
    isTaskSuccessful:
      (cloudField<boolean | null>(raw, 'isTaskSuccessful', 'is_task_successful') ?? null) ?? null,
  }
}

function cloudStatusStillRunning(status: string) {
  return status === 'created' || status === 'idle' || status === 'running'
}

type Role = 'user' | 'assistant'

type Message = { id: string; role: Role; text: string }

type BrowserStep = { order: number; description: string; state: string }

type BrowserAction = { id: string; label: string; url: string }

type BrowserSession = {
  id: string
  mode: string
  status: string
  task: string
  steps: BrowserStep[]
  actions: BrowserAction[]
  note?: string
}

function taskFromLivePlan(live: BrowserSession, lastUserMessage: string) {
  const stepLine = live.steps.map((s) => s.description).join(' ')
  return [
    'You are helping a patient navigate healthcare on the public web only.',
    `User said: "${lastUserMessage.slice(0, 500)}".`,
    `Goal: ${live.task}`,
    `Suggested steps: ${stepLine}`,
    'Do not log into accounts or type passwords. Prefer opening maps or official hospital/clinic sites. Summarize concrete next actions for the user.',
  ].join(' ')
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function JourneyPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi—CarePilot can help you find care, schedule visits, check insurance basics, or pharmacy steps. Use Live actions for suggested links and optional Browser Use Cloud when your server has an API key.',
    },
  ])
  const [draft, setDraft] = useState('')
  const [live, setLive] = useState<BrowserSession | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [cloudConfigured, setCloudConfigured] = useState(false)
  const [cloudSession, setCloudSession] = useState<CloudSessionView | null>(null)
  const [cloudActive, setCloudActive] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const lastPatientMessageRef = useRef('')
  const cloudPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    void fetch('/api/journey/cloud-status')
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setCloudConfigured(Boolean(d.configured)))
      .catch(() => setCloudConfigured(false))
  }, [])

  useEffect(
    () => () => {
      if (cloudPollRef.current) {
        clearInterval(cloudPollRef.current)
        cloudPollRef.current = null
      }
    },
    [],
  )

  function stopCloudPoll() {
    if (cloudPollRef.current) {
      clearInterval(cloudPollRef.current)
      cloudPollRef.current = null
    }
  }

  async function startCloudTask() {
    if (!live) return
    stopCloudPoll()
    setCloudError(null)
    setCloudActive(true)
    setCloudSession(null)
    try {
      const task = taskFromLivePlan(live, lastPatientMessageRef.current)
      const res = await fetch('/api/journey/cloud-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string
      }
      if (!res.ok) {
        throw new Error(data.error ?? res.statusText)
      }
      let current = parseCloudSession(data)
      setCloudSession(current)
      const sessionId = current.id
      if (!sessionId) {
        throw new Error('Cloud did not return a session id')
      }
      if (!cloudStatusStillRunning(current.status)) {
        setCloudActive(false)
        return
      }
      const pollOnce = async () => {
        const r = await fetch(`/api/journey/cloud-task/${encodeURIComponent(sessionId)}`)
        const d = (await r.json().catch(() => ({}))) as Record<string, unknown> & {
          error?: string
        }
        if (!r.ok) {
          setCloudError(d.error ?? r.statusText)
          stopCloudPoll()
          setCloudActive(false)
          return
        }
        current = parseCloudSession(d)
        setCloudSession({ ...current })
        if (!cloudStatusStillRunning(current.status)) {
          stopCloudPoll()
          setCloudActive(false)
        }
      }
      cloudPollRef.current = setInterval(() => void pollOnce(), 3000)
      void pollOnce()
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : 'Cloud task failed')
      setCloudActive(false)
    }
  }

  async function send() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    lastPatientMessageRef.current = text

    const history = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, text: m.text }))

    setMessages((m) => [...m, { id: makeId(), role: 'user', text }])
    setLiveLoading(true)
    setLiveError(null)
    stopCloudPoll()
    setCloudSession(null)
    setCloudError(null)
    setCloudActive(false)
    try {
      const res = await fetch('/api/journey/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? res.statusText)
      }
      const assistantText = (data as { assistantText?: string }).assistantText
      const browserSession = (data as { browserSession?: BrowserSession }).browserSession
      setMessages((m) => [
        ...m,
        {
          id: makeId(),
          role: 'assistant',
          text: assistantText ?? 'No reply from planner.',
        },
      ])
      if (browserSession) setLive(browserSession)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      setLiveError(msg)
      setMessages((m) => [
        ...m,
        {
          id: makeId(),
          role: 'assistant',
          text: `Could not reach the care planner (${msg}). Check that the API is running on port 3001 and that Gemini is configured if you use it.`,
        },
      ])
    } finally {
      setLiveLoading(false)
    }
  }

  return (
    <div className="cp-journey">
      <section className="cp-chat" aria-label="Chat assistant">
        <header className="cp-chat__head">
          <h1 className="cp-chat__title">Assistant</h1>
          <p className="cp-chat__sub">Planner + optional Browser Use Cloud (API key on server)</p>
        </header>
        <div className="cp-chat__messages" ref={listRef} role="log" aria-live="polite">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={'cp-bubble cp-bubble--' + msg.role}
            >
              {msg.text.split('\n').map((line, i) => (
                <span key={i}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="cp-chat__composer">
          <label className="visually-hidden" htmlFor="cp-chat-input">
            Message
          </label>
          <textarea
            id="cp-chat-input"
            className="cp-chat__input"
            rows={2}
            placeholder="Type a message…"
            value={draft}
            disabled={liveLoading}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            onClick={() => void send()}
            disabled={liveLoading}
          >
            {liveLoading ? '…' : 'Send'}
          </button>
        </div>
      </section>
      <aside className="cp-live" aria-label="Live actions">
        <h2 className="cp-live__title">Live actions</h2>
        <p className="cp-live__sub">
          {live
            ? `${live.mode} · ${live.status}${cloudConfigured ? ' · Cloud ready' : ''}`
            : cloudConfigured
              ? 'Plan + Browser Use Cloud'
              : 'Plan (add BROWSER_USE_API_KEY for Cloud)'}
        </p>
        <div className="cp-live__card">
          {liveError ? (
            <p className="cp-live__hint" role="alert">
              {liveError}
            </p>
          ) : null}
          {liveLoading ? (
            <div className="cp-live__status">
              <span className="cp-live__dot cp-live__dot--pulse" aria-hidden />
              Planning…
            </div>
          ) : live ? (
            <>
              <div className="cp-live__status">
                <span className="cp-live__dot cp-live__dot--on" aria-hidden />
                {live.task}
              </div>
              {live.note ? <p className="cp-live__hint">{live.note}</p> : null}
              <ol className="cp-live__steps">
                {live.steps.map((s) => (
                  <li
                    key={s.order}
                    className={
                      'cp-live__step cp-live__step--' + (s.state === 'done' ? 'done' : 'pending')
                    }
                  >
                    <span className="cp-live__step-num">{s.order}</span>
                    {s.description}
                  </li>
                ))}
              </ol>
              {live.actions.length > 0 ? (
                <div className="cp-live__actions">
                  {live.actions.map((a) => (
                    <a
                      key={a.id}
                      className="cp-btn cp-btn--secondary cp-live__action"
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.label}
                    </a>
                  ))}
                </div>
              ) : null}
              {cloudConfigured ? (
                <div className="cp-live__cloud">
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary cp-live__action"
                    disabled={cloudActive}
                    onClick={() => void startCloudTask()}
                  >
                    {cloudActive ? 'Cloud agent running…' : 'Run on Browser Use Cloud'}
                  </button>
                  <p className="cp-live__hint cp-live__hint--tight">
                    Uses{' '}
                    <a href="https://cloud.browser-use.com/" target="_blank" rel="noreferrer">
                      Browser Use Cloud
                    </a>{' '}
                    (your balance). Task is built from this plan + last message.
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="cp-live__status">
                <span className="cp-live__dot" aria-hidden />
                Idle
              </div>
              <p className="cp-live__hint">
                Send a message to generate next steps. A real Browser Use agent would run these
                in Playwright and stream progress here after you approve each session.
              </p>
            </>
          )}
          {cloudError ? (
            <p className="cp-live__hint cp-live__cloud-error" role="alert">
              Cloud: {cloudError}
            </p>
          ) : null}
          {cloudSession ? (
            <div className="cp-live__cloud-panel">
              <p className="cp-live__cloud-meta">
                Session <code className="cp-live__code">{cloudSession.id.slice(0, 8)}…</code> ·{' '}
                {cloudSession.status}
                {cloudSession.stepCount > 0 ? ` · ${cloudSession.stepCount} steps` : null}
              </p>
              {cloudSession.lastStepSummary ? (
                <p className="cp-live__hint">{cloudSession.lastStepSummary}</p>
              ) : null}
              {cloudSession.liveUrl ? (
                <>
                  <a
                    className="cp-live__live-link"
                    href={cloudSession.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open live browser (new tab)
                  </a>
                  <iframe
                    className="cp-live__iframe"
                    title="Browser Use Cloud live view"
                    src={cloudSession.liveUrl}
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                </>
              ) : null}
              {cloudSession.output != null && !cloudStatusStillRunning(cloudSession.status) ? (
                <pre className="cp-live__output">
                  {typeof cloudSession.output === 'string'
                    ? cloudSession.output
                    : JSON.stringify(cloudSession.output, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
