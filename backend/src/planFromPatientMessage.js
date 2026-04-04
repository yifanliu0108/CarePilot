/**
 * Demo planner: turns a patient message into assistant text + a structured "browser task"
 * shape that matches what you would stream from Browser Use (steps, suggested URLs).
 * Replace with a real Agent + ChatGoogle when GOOGLE_GENERATIVE_AI_API_KEY is set and
 * you run Playwright-backed tasks (see browser-use Agent + register_new_step_callback).
 */

const norm = (s) => s.toLowerCase()

function detectIntent(text) {
  const t = norm(text)
  if (/\b(er|emergency|urgent|911|hospital|clinic|doctor|find care)\b/.test(t)) {
    return 'care_search'
  }
  if (/\b(appoint|schedule|booking|see a doctor|visit)\b/.test(t)) {
    return 'scheduling'
  }
  if (/\b(insurance|coverage|copay|prior auth|claim)\b/.test(t)) {
    return 'insurance'
  }
  if (/\b(pharmacy|prescription|refill|medication|medicine)\b/.test(t)) {
    return 'pharmacy'
  }
  return 'general'
}

export function planFromPatientMessage(message) {
  const trimmed = String(message ?? '').trim()
  const intent = detectIntent(trimmed)

  const plans = {
    care_search: {
      task: 'Find nearby emergency or urgent care options',
      assistantText: [
        'Here is a safe path to find care near you. I cannot diagnose emergencies—if this feels life-threatening, call 911 or go to the nearest ER.',
        '',
        'Next: open maps, search for hospitals or urgent care, and call ahead to confirm hours and services.',
      ].join('\n'),
      steps: [
        { order: 1, description: 'Confirm severity (911 vs urgent care vs primary care)', state: 'done' },
        { order: 2, description: 'Open maps and search “hospital” or “urgent care near me”', state: 'pending' },
        { order: 3, description: 'Review distance, hours, and ER vs urgent care', state: 'pending' },
        { order: 4, description: 'Call the facility or use their triage line if unsure', state: 'pending' },
      ],
      actions: [
        {
          id: 'maps-hospital',
          label: 'Search hospitals (Google Maps)',
          url: 'https://www.google.com/maps/search/hospital/',
        },
        {
          id: 'maps-urgent',
          label: 'Search urgent care (Google Maps)',
          url: 'https://www.google.com/maps/search/urgent+care/',
        },
      ],
    },
    scheduling: {
      task: 'Look up how to schedule a visit with a provider',
      assistantText: [
        'To schedule a visit, you will usually need your insurance card and a list of preferred dates.',
        '',
        'A browser agent could open your clinic’s scheduling page and walk the form with your approval.',
      ].join('\n'),
      steps: [
        { order: 1, description: 'Find your clinic or health system patient portal', state: 'pending' },
        { order: 2, description: 'Sign in or use “schedule as guest” if offered', state: 'pending' },
        { order: 3, description: 'Pick department, provider, and reason for visit', state: 'pending' },
        { order: 4, description: 'Confirm insurance and contact information', state: 'pending' },
      ],
      actions: [
        {
          id: 'zocdoc',
          label: 'Example: find providers (Zocdoc)',
          url: 'https://www.zocdoc.com/',
        },
      ],
    },
    insurance: {
      task: 'Check coverage or find in-network care',
      assistantText: [
        'For insurance questions, your plan’s member site is the source of truth for coverage and in-network lists.',
        '',
        'An agent could navigate the portal steps after you log in—never share passwords in chat.',
      ].join('\n'),
      steps: [
        { order: 1, description: 'Open your insurer’s member portal', state: 'pending' },
        { order: 2, description: 'Find “find a doctor” or “coverage & benefits”', state: 'pending' },
        { order: 3, description: 'Verify in-network status before booking', state: 'pending' },
      ],
      actions: [
        {
          id: 'healthcare-gov',
          label: 'Coverage basics (HealthCare.gov)',
          url: 'https://www.healthcare.gov/',
        },
      ],
    },
    pharmacy: {
      task: 'Refill or locate a pharmacy',
      assistantText: [
        'For refills, your pharmacy’s app or website is usually fastest. Some plans require mail-order for maintenance meds.',
      ].join('\n'),
      steps: [
        { order: 1, description: 'Open your pharmacy (CVS, Walgreens, etc.) account', state: 'pending' },
        { order: 2, description: 'Request refill or transfer prescription if needed', state: 'pending' },
        { order: 3, description: 'Confirm pickup time or delivery', state: 'pending' },
      ],
      actions: [
        {
          id: 'maps-pharmacy',
          label: 'Pharmacies near me (Maps)',
          url: 'https://www.google.com/maps/search/pharmacy/',
        },
      ],
    },
    general: {
      task: 'Clarify what the patient wants to accomplish on the web',
      assistantText: [
        'Tell me a bit more: are you trying to find a hospital, book an appointment, check insurance, or refill a prescription?',
        '',
        'When you are ready, approved “Live actions” can automate browser steps on sites you choose.',
      ].join('\n'),
      steps: [
        { order: 1, description: 'Identify the goal (care search, scheduling, insurance, pharmacy)', state: 'pending' },
        { order: 2, description: 'Pick a trusted site or portal to open', state: 'pending' },
        { order: 3, description: 'Run guided browser steps with your confirmation', state: 'pending' },
      ],
      actions: [],
    },
  }

  const p = plans[intent]
  const id = `sess-${Date.now().toString(36)}`

  return {
    intent,
    assistantText: p.assistantText,
    browserSession: {
      id,
      mode: 'mock',
      status: 'preview',
      task: p.task,
      steps: p.steps,
      actions: p.actions,
      note:
        intent === 'general'
          ? 'No specific browser task yet—reply with more detail to get a concrete plan.'
          : 'Mock plan for demo. Wire browser-use Agent here to execute steps in a real browser.',
    },
  }
}
