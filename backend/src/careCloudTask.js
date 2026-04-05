/**
 * Browser Use task: find nearby hospitals / ER / urgent care with Maps-friendly links.
 * Output JSON for CarePilot chat + sidebar.
 */

/**
 * @param {{ userMessage?: string, context?: string }} input
 * @returns {string}
 */
export function buildCarePlacesTask(input) {
  const userMessage = String(input.userMessage ?? '').slice(0, 800)
  const context = String(input.context ?? '').slice(0, 500)
  const fast = process.env.BROWSER_USE_CARE_FAST?.trim() === '1'
  const maxPlaces = fast ? 3 : 5

  return [
    fast
      ? 'SPEED MODE: One focused Maps search, then list top results—minimize extra navigation.'
      : '',
    'You are a care navigation helper for a US wellness app. Use only public web pages.',
    'Do NOT log in, book appointments, or enter PHI. Prefer official hospital sites and Google Maps.',
    '',
    'Goal: Help the user find nearby emergency or urgent care options to consider (not medical advice).',
    `User message: "${userMessage}"`,
    context ? `Planner context: ${context}` : '',
    '',
    'Steps:',
    '1) Open Google Maps in the browser (maps.google.com) or use Google search.',
    '2) Search for hospitals, emergency rooms, or urgent care near the user’s described location (or "near me" if no city given).',
    `3) Collect up to ${maxPlaces} relevant facilities with name, approximate area, and a shareable Google Maps URL (place URL or search URL).`,
    '',
    'When finished, respond with ONLY valid JSON (no markdown fences, no commentary):',
    '{"places":[{"name":"string","address":"string","mapsUrl":"https://...","rating":"optional string","note":"optional short note e.g. ER vs urgent care"}]}',
    'mapsUrl must be a full https URL the user can tap to open Maps or the listing.',
  ]
    .filter(Boolean)
    .join('\n')
}
