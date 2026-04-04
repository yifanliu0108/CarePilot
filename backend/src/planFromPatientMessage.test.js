import assert from 'node:assert/strict'
import test from 'node:test'
import { planFromPatientMessage } from './planFromPatientMessage.js'

test('hospital intent yields care_search and map actions', () => {
  const r = planFromPatientMessage('I need a hospital near me for chest pain follow-up')
  assert.equal(r.intent, 'care_search')
  assert.match(r.browserSession.task, /nearby|care/i)
  assert.ok(r.browserSession.actions.some((a) => a.url.includes('google.com/maps')))
  assert.ok(r.browserSession.steps.length >= 3)
})

test('scheduling intent', () => {
  const r = planFromPatientMessage('Help me schedule an appointment with a dermatologist')
  assert.equal(r.intent, 'scheduling')
  assert.ok(r.browserSession.actions.length >= 1)
})

test('insurance intent', () => {
  const r = planFromPatientMessage('Is this specialist in network for my insurance?')
  assert.equal(r.intent, 'insurance')
})

test('pharmacy intent', () => {
  const r = planFromPatientMessage('I need to refill my prescription at a pharmacy')
  assert.equal(r.intent, 'pharmacy')
})

test('general fallback', () => {
  const r = planFromPatientMessage('hello')
  assert.equal(r.intent, 'general')
  assert.equal(r.browserSession.mode, 'mock')
})
