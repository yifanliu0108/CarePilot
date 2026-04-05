/**
 * Retry wrapper for transient Gemini / network failures (429, 503, timeouts, connection drops).
 */

/**
 * True when the API error text clearly describes an invalid/missing API key.
 * @param {string} msg
 * @returns {boolean}
 */
function looksLikeInvalidApiKeyMessage(msg) {
  const m = String(msg);
  return (
    /API_KEY_INVALID/i.test(m) ||
    /\bAPI key not valid\b/i.test(m) ||
    /\binvalid\s+API\s+key\b/i.test(m) ||
    /\bAPI\s+key\s+(is\s+)?(invalid|expired|not\s+valid|malformed|wrong)\b/i.test(m) ||
    /\b(missing|malformed)\s+API\s+key\b/i.test(m) ||
    /not\s+a\s+valid\s+API\s+key/i.test(m) ||
    /please pass a valid api key/i.test(m)
  );
}

/**
 * Turn SDK errors (often huge JSON strings) into a short message for API JSON responses.
 * @param {unknown} err
 * @returns {string}
 */
export function formatGeminiErrorForClient(err) {
  const raw =
    err && typeof err === "object" && err !== null && "message" in err
      ? String(/** @type {{ message?: unknown }} */ (err).message)
      : String(err ?? "Unknown error");

  let nested = null;
  try {
    nested = JSON.parse(raw);
  } catch {
    const i = raw.indexOf('{"error"');
    if (i >= 0) {
      try {
        nested = JSON.parse(raw.slice(i));
      } catch {
        /* ignore */
      }
    }
  }

  const apiErr = nested && typeof nested === "object" && nested.error ? nested.error : null;
  if (apiErr && typeof apiErr === "object") {
    const msg = typeof apiErr.message === "string" ? apiErr.message : "";
    const status = typeof apiErr.status === "string" ? apiErr.status : "";
    const code = apiErr.code;

    let apiKeyInvalidReason = false;
    const details = apiErr.details;
    if (Array.isArray(details)) {
      for (const d of details) {
        if (d && typeof d === "object" && d.reason === "API_KEY_INVALID") {
          apiKeyInvalidReason = true;
          break;
        }
      }
    }

    const msgLooksLikeKeyProblem =
      apiKeyInvalidReason || looksLikeInvalidApiKeyMessage(msg);

    if (status === "UNAUTHENTICATED" || msgLooksLikeKeyProblem) {
      return (
        "Gemini API key is missing, invalid, or expired. Create a key at https://aistudio.google.com/apikey , set GEMINI_API_KEY in backend/.env or the repo-root .env, save, then restart the API." +
        " (RAG_DISABLED only turns off retrieval/embeddings; the chat reply still calls Gemini and needs a valid key.)"
      );
    }

    if (status === "PERMISSION_DENIED") {
      const hint =
        " If the same key works elsewhere, check API key restrictions (IP, HTTP referrer, apps) under Google Cloud Console → Credentials, and that the Generative Language API is enabled.";
      const body =
        msg.length > 0
          ? msg.length > 220
            ? `${msg.slice(0, 217)}…`
            : msg
          : "Google returned PERMISSION_DENIED.";
      return `${body}${hint}`;
    }
    if (status === "INVALID_ARGUMENT" && !msgLooksLikeKeyProblem) {
      return msg.length > 0
        ? msg.length > 320
          ? `${msg.slice(0, 317)}…`
          : msg
        : "Gemini rejected the request (invalid argument). Check GEMINI_MODEL and server logs.";
    }
    if (
      code === 429 ||
      status === "RESOURCE_EXHAUSTED" ||
      /quota|exceeded|rate limit/i.test(msg)
    ) {
      const googleHint =
        msg.length > 0
          ? msg.length > 220
            ? `${msg.slice(0, 217)}…`
            : msg
          : "";
      const fromGoogle = googleHint ? ` Google says: ${googleHint}` : "";
      return (
        "Gemini returned rate or quota pressure (429 / RESOURCE_EXHAUSTED)." +
        fromGoogle +
        " The usage chart in AI Studio often does not show the limit that tripped: limits are separate for chat vs embeddings, per model, and per minute (RPM/TPM), not only daily totals." +
        " Wait a minute and retry, set RAG_DISABLED=1 in backend/.env to skip retrieval embed calls, or see https://ai.google.dev/gemini-api/docs/rate-limits"
      );
    }
    if (code === 404 || /not found|unsupported/i.test(msg)) {
      return "Gemini model or endpoint not found. Check GEMINI_MODEL in backend/.env.";
    }
    if (msg) return msg.length > 320 ? `${msg.slice(0, 317)}…` : msg;
  }

  if (raw.length > 400 && raw.includes('"error"')) {
    return "Gemini request failed. Check GEMINI_API_KEY and backend logs.";
  }
  return raw.length > 400 ? `${raw.slice(0, 397)}…` : raw;
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isRetryableGeminiError(err) {
  if (err == null) return false;
  const name = typeof err === "object" && err && "name" in err ? String(err.name) : "";
  if (name === "AbortError") return false;

  const msg = String(
    typeof err === "object" && err && "message" in err ? err.message : err,
  ).toLowerCase();
  const code =
    typeof err === "object" && err && "code" in err ? String(err.code) : "";

  if (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("resource_exhausted") ||
    msg.includes("unavailable") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("overloaded") ||
    code === "429" ||
    code === "503" ||
    code === "UNAVAILABLE"
  ) {
    return true;
  }
  return false;
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, baseDelayMs?: number, maxDelayMs?: number, isRetryable?: (e: unknown) => boolean }} [opts]
 * @returns {Promise<T>}
 */
export async function retryAsync(fn, opts = {}) {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  const isRetryable = opts.isRetryable ?? isRetryableGeminiError;

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt >= maxAttempts || !isRetryable(e)) throw e;
      const delay = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 120),
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
