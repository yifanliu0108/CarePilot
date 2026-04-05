/**
 * Strip BOM, whitespace, and wrapping quotes from GEMINI_API_KEY (common .env mistakes).
 * @param {string | undefined} v
 * @returns {string}
 */
export function normalizeGeminiApiKeyString(v) {
  if (typeof v !== "string") return "";
  return v.replace(/^\uFEFF/, "").trim().replace(/^["']|["']$/g, "");
}
