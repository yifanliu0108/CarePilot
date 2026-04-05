/**
 * Builds a Browser Use Cloud task: search chain grocers for suggested items + prices.
 * Agent output is requested as JSON for the CarePilot UI (see docs on cloud.browser-use.com).
 *
 * Set `BROWSER_USE_GROCERY_FAST=1` in backend/.env for fewer stores & queries (lower latency).
 */

const MAX_ITEMS_FULL = 8
const MAX_ITEMS_FAST = 4

function groceryFastMode() {
  return process.env.BROWSER_USE_GROCERY_FAST?.trim() === '1'
}

/**
 * @param {{ userMessage?: string, priceCheckItems?: string[], nutritionSummary?: string, nearbyStoreHints?: string[] }} input
 * @returns {string}
 */
export function buildGroceryPriceTask(input) {
  const fast = groceryFastMode()
  const maxItems = fast ? MAX_ITEMS_FAST : MAX_ITEMS_FULL
  const userMessage = String(input.userMessage ?? '').slice(0, 500)
  const nutritionSummary = String(input.nutritionSummary ?? '').slice(0, 300)
  const hintList = Array.isArray(input.nearbyStoreHints)
    ? input.nearbyStoreHints.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 10)
    : []
  const nearbyBlock = hintList.length
    ? [
        'Nearby stores (from Google Maps — prioritize these retailers when they have a public grocery website; include the chain name in results[].store):',
        ...hintList.map((h, i) => `${i + 1}. ${h}`),
        fast
          ? 'Still collect Walmart and Vons prices for each product query when possible; add another chain from the list above if its site is easy to search.'
          : 'Cover Walmart, Vons, and Ralphs as baseline; add rows for other chains from the list when relevant.',
      ].join('\n')
    : ''
  const rawItems = Array.isArray(input.priceCheckItems) ? input.priceCheckItems : []
  const items = rawItems
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .slice(0, maxItems)

  const itemsBlock =
    items.length > 0
      ? items.map((q, i) => `${i + 1}. ${q}`).join('\n')
      : fast
        ? '1. Derive at most 3 concrete grocery search queries from the user message (speed over completeness).'
        : '1. Derive up to 5 concrete grocery product search queries from the user message and nutrition goal (e.g. “fresh kiwi”, “tart cherry juice”).'

  if (fast) {
    return [
      'SPEED MODE: Minimize total browser steps. Prefer accurate Walmart + Vons data over visiting every chain.',
      'You are a grocery shopping assistant for a wellness app in the United States.',
      'Use only public pages. Do NOT log in, create accounts, enter payment info, or solve CAPTCHAs.',
      '',
      'Visit ONLY these two stores (skip Ralphs in this run):',
      '- Walmart — https://www.walmart.com/search?q=ENCODED_QUERY',
      '- Vons — https://www.vons.com (site search; copy search URL to searchUrl when possible).',
      '',
      'For each query: search both stores, grab the first good match per store, price + URLs, then move on—do not open extra tabs.',
      '',
      `User message: "${userMessage}"`,
      nutritionSummary ? `Nutrition focus: ${nutritionSummary}` : '',
      nearbyBlock ? `\n${nearbyBlock}\n` : '',
      '',
      'Search queries:',
      itemsBlock,
      '',
      'Respond with ONLY valid JSON (no markdown). Shape:',
      '{"items":[{"query":"string","results":[{"store":"Walmart|Vons","product":"string","price":"string","productUrl":"","searchUrl":""}]}]}',
      'Include only Walmart and Vons in results[].store for this run.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    'You are a grocery shopping assistant for a wellness app in the United States.',
    'Use only public pages. Do NOT log in, create accounts, enter payment info, or solve CAPTCHAs. If a site blocks you or hides prices behind login, record price as "unavailable" and continue.',
    '',
    'Stores (use each site’s search; build direct search URLs when possible so the user can reopen the same search):',
    '- Walmart: base https://www.walmart.com — search URL pattern https://www.walmart.com/search?q=ENCODED_QUERY',
    '- Vons: https://www.vons.com — use site search; include a search/results URL in searchUrl when you can copy it from the address bar.',
    '- Ralphs: https://www.ralphs.com — same as Vons.',
    '',
    'Adding items to a cart almost always requires a logged-in account. Do NOT attempt checkout. Instead:',
    '- Open the best-matching product page when possible and copy its URL as productUrl.',
    '- Always set searchUrl to a direct link to that store’s search results page for the query (e.g. Walmart search?q=), so the user can shop or add to cart themselves after signing in.',
    '',
    `User message: "${userMessage}"`,
    nutritionSummary ? `Nutrition focus: ${nutritionSummary}` : '',
    nearbyBlock ? `\n${nearbyBlock}\n` : '',
    '',
    'For each search query, on each store: run search, open the first clearly relevant in-stock food item if possible, note product name, displayed price, product page URL, and the search-results URL.',
    '',
    'Search queries:',
    itemsBlock,
    '',
    'When finished, respond with ONLY valid JSON (no markdown fences, no commentary). Shape:',
    '{"items":[{"query":"string","results":[{"store":"Walmart|Vons|Ralphs","product":"string","price":"string","productUrl":"","searchUrl":""}]}]}',
    'Use empty string for unknown URLs. searchUrl should be the store search page for that query. Prefer in-stock items; if none, say so in product.',
  ]
    .filter(Boolean)
    .join('\n')
}
