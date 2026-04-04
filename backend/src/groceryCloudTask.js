/**
 * Builds a Browser Use Cloud task: search chain grocers for suggested items + prices.
 * Agent output is requested as JSON for the CarePilot UI (see docs on cloud.browser-use.com).
 */

const MAX_ITEMS = 8;

/**
 * @param {{ userMessage?: string, priceCheckItems?: string[], nutritionSummary?: string }} input
 * @returns {string}
 */
export function buildGroceryPriceTask(input) {
  const userMessage = String(input.userMessage ?? "").slice(0, 500);
  const nutritionSummary = String(input.nutritionSummary ?? "").slice(0, 300);
  const rawItems = Array.isArray(input.priceCheckItems) ? input.priceCheckItems : [];
  const items = rawItems
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS);

  const itemsBlock =
    items.length > 0
      ? items.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "1. Derive up to 5 concrete grocery product search queries from the user message and nutrition goal (e.g. “fresh kiwi”, “tart cherry juice”).";

  return [
    "You are a grocery price research assistant for a wellness app in the United States.",
    "Use only public pages. Do NOT log in, create accounts, enter payment info, or solve CAPTCHAs. If a site blocks you or hides prices behind login, record price as \"unavailable\" and continue.",
    "",
    "Visit these retailer sites and use their search boxes for each query:",
    "- Walmart (grocery / food search): start at https://www.walmart.com",
    "- Vons: https://www.vons.com",
    "- Ralphs: https://www.ralphs.com",
    "",
    `User message: "${userMessage}"`,
    nutritionSummary ? `Nutrition focus: ${nutritionSummary}` : "",
    "",
    "For each search query, on each store: run search, open the first clearly relevant food result if possible, and copy the product name and the shelf/online price shown (per unit if visible).",
    "",
    "Search queries:",
    itemsBlock,
    "",
    "When finished, respond with ONLY valid JSON (no markdown fences, no commentary). Shape:",
    '{"items":[{"query":"string","results":[{"store":"Walmart|Vons|Ralphs","product":"string","price":"string","productUrl":""}]}]}',
    "Use empty string for productUrl if unknown. Prefer in-stock items; if none, say so in product.",
  ]
    .filter(Boolean)
    .join("\n");
}
