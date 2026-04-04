import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAssistPayload, buildGeminiContents } from './geminiAssist.js'

test('normalizeAssistPayload fills defaults for minimal JSON', () => {
  const r = normalizeAssistPayload({
    intent: 'general',
    assistantText: 'Hello',
    browserSession: {
      id: 'sess-x',
      mode: 'gemini',
      status: 'preview',
      task: 'Find care',
      steps: [{ order: 1, description: 'Step one', state: 'pending' }],
      actions: [{ id: 'a1', label: 'Maps', url: 'https://www.google.com/maps/' }],
    },
  })
  assert.equal(r.intent, 'general')
  assert.equal(r.assistantText, 'Hello')
  assert.equal(r.browserSession.mode, 'gemini')
  assert.equal(r.browserSession.steps.length, 1)
  assert.equal(r.browserSession.actions[0].url, 'https://www.google.com/maps/')
})

test('buildGeminiContents interleaves history and current user turn', () => {
  const c = buildGeminiContents('?', [
    { role: 'user', text: 'find a hospital' },
    { role: 'assistant', text: 'Here are maps links...' },
  ])
  assert.equal(c.length, 3)
  assert.equal(c[0].role, 'user')
  assert.equal(c[1].role, 'model')
  assert.equal(c[2].role, 'user')
  assert.ok(String(c[2].parts?.[0]?.text).includes('?'))
})

test('normalizeAssistPayload repairs bad action URLs', () => {
  const r = normalizeAssistPayload({
    intent: 'care_search',
    assistantText: 'Ok',
    browserSession: {
      id: '',
      mode: 'gemini',
      status: 'preview',
      task: 't',
      steps: [],
      actions: [{ id: 'x', label: 'y', url: 'not-a-url' }],
    },
  })
  assert.ok(r.browserSession.id.startsWith('sess-'))
  assert.match(r.browserSession.actions[0].url, /^https:\/\//)
})
