/**
 * Lightweight RAG: embed curated corpus with Gemini, retrieve top chunks per query,
 * inject into assist system prompts. No LangChain — keeps the stack small.
 *
 * Env: GEMINI_EMBEDDING_MODEL (default text-embedding-004), RAG_TOP_K (default 4),
 * RAG_MIN_SCORE (default 0.1), RAG_KEYWORD_WEIGHT (default 0.22, 0–1 blend with cosine),
 * RAG_DISABLED=1 to skip retrieval, RAG_EMBEDDING_CACHE_DISABLED=1 to skip disk cache.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { retryAsync, isRetryableGeminiError } from "../geminiRetry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = join(__dirname, "corpus.json");
const CACHE_PATH = join(__dirname, "embeddings-cache.json");

/** @type {string} */
let corpusRaw = "[]";
/** @type {Array<{ id: string, title: string, tags?: string[], text: string }>} */
let corpus = [];

try {
  corpusRaw = readFileSync(CORPUS_PATH, "utf8");
  corpus = JSON.parse(corpusRaw);
} catch (e) {
  console.warn("rag: could not load corpus.json", e?.message ?? e);
}

const corpusSha256 = createHash("sha256").update(corpusRaw).digest("hex");

/** True when RAG_DISABLED=1|true|yes — no embedding or retrieval. Exposed for /api/health. */
export function ragDisabledByEnv() {
  const v = process.env.RAG_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function ragDisabled() {
  return ragDisabledByEnv();
}

function embeddingCacheDisabled() {
  const v = process.env.RAG_EMBEDDING_CACHE_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Exposed for /api/health and ops. */
export function ragFeatureEnabled() {
  return !ragDisabled() && corpus.length > 0;
}

function embeddingModel() {
  return process.env.GEMINI_EMBEDDING_MODEL?.trim() || "text-embedding-004";
}

function topK() {
  const n = Number(process.env.RAG_TOP_K?.trim());
  if (Number.isFinite(n) && n >= 1 && n <= 12) return Math.floor(n);
  return 4;
}

/** Minimum hybrid score (0–1) to include a chunk. */
function ragMinScore() {
  const n = Number(process.env.RAG_MIN_SCORE?.trim());
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return 0.1;
}

/** Weight on keyword overlap vs cosine (0 = pure cosine, 1 = pure keyword). */
function ragKeywordWeight() {
  const n = Number(process.env.RAG_KEYWORD_WEIGHT?.trim());
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return 0.22;
}

const STOP = new Set(
  "a an the and or for to of in on is are was were be been being it its this that these those i you we they he she my your our their me him her them what which who how when where why if as at by from with about into through during before after above below between under again further then once here there all both each few more most other some such only own same so than too very can could should would will just don now".split(
    " ",
  ),
);

/** @param {string} s */
function tokenize(s) {
  const m = String(s).toLowerCase().match(/[a-z0-9]+/g);
  return m ?? [];
}

/**
 * 0–1: share of query tokens (length > 2, not stopword) found in chunk title/tags/text.
 * Exported for unit tests.
 * @param {string} query
 * @param {{ title: string, tags?: string[], text: string }} chunk
 */
export function keywordOverlapRatio(query, chunk) {
  const qTokens = tokenize(query).filter(
    (t) => t.length > 2 && !STOP.has(t),
  );
  if (qTokens.length === 0) return 0;
  const hay = `${chunk.title} ${(chunk.tags ?? []).join(" ")} ${chunk.text}`.toLowerCase();
  let hits = 0;
  for (const t of qTokens) {
    if (hay.includes(t)) hits++;
  }
  return hits / qTokens.length;
}

/**
 * @param {number} cosine
 * @param {number} keyword
 * @returns {number}
 */
function hybridScore(cosine, keyword) {
  const w = ragKeywordWeight();
  return (1 - w) * cosine + w * keyword;
}

/** @param {number[]} a @param {number[]} b */
export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

/** @param {import('@google/genai').GoogleGenAI} ai */
async function embedBatch(ai, texts, taskType) {
  const model = embeddingModel();
  return retryAsync(
    async () => {
      const res = await ai.models.embedContent({
        model,
        contents: texts,
        config: { taskType },
      });
      const out = [];
      const embeddings = res.embeddings ?? [];
      for (let i = 0; i < texts.length; i++) {
        const values = embeddings[i]?.values;
        if (!values?.length) {
          throw new Error(`embedContent missing vector at index ${i}`);
        }
        out.push(values);
      }
      return out;
    },
    { maxAttempts: 3, baseDelayMs: 500, isRetryable: isRetryableGeminiError },
  );
}

/** @returns {number[][] | null} */
function tryLoadEmbeddingCache() {
  if (embeddingCacheDisabled() || corpus.length === 0) return null;
  try {
    const raw = readFileSync(CACHE_PATH, "utf8");
    const data = JSON.parse(raw);
    if (data.corpusSha256 !== corpusSha256) return null;
    if (data.embeddingModel !== embeddingModel()) return null;
    if (!Array.isArray(data.vectors) || data.vectors.length !== corpus.length)
      return null;
    return data.vectors;
  } catch {
    return null;
  }
}

/** @param {number[][]} vectors */
async function saveEmbeddingCache(vectors) {
  if (embeddingCacheDisabled() || corpus.length === 0) return;
  try {
    const payload = JSON.stringify({
      corpusSha256,
      embeddingModel: embeddingModel(),
      vectors,
    });
    await writeFile(CACHE_PATH, payload, "utf8");
  } catch (e) {
    console.warn("rag: could not save embedding cache", e?.message ?? e);
  }
}

/** @type {Promise<void> | null} */
let loadPromise = null;
/** @type {Array<{ chunk: (typeof corpus)[0], vector: number[] }> | null} */
let indexed = null;

/**
 * @param {import('@google/genai').GoogleGenAI} ai
 * @returns {Promise<void>}
 */
export function ensureRagIndexed(ai) {
  if (ragDisabled() || corpus.length === 0) return Promise.resolve();
  if (indexed) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = (async () => {
      const cached = tryLoadEmbeddingCache();
      if (cached) {
        indexed = corpus.map((chunk, i) => ({ chunk, vector: cached[i] }));
        return;
      }

      const texts = corpus.map((c) => `${c.title}\n${c.text}`.slice(0, 8000));
      const batchSize = 16;
      const vectors = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const slice = texts.slice(i, i + batchSize);
        const vecs = await embedBatch(ai, slice, "RETRIEVAL_DOCUMENT");
        vectors.push(...vecs);
      }
      indexed = corpus.map((chunk, i) => ({ chunk, vector: vectors[i] }));
      await saveEmbeddingCache(vectors);
    })();
  }
  return loadPromise.catch((err) => {
    loadPromise = null;
    indexed = null;
    throw err;
  });
}

/**
 * Build a query string from the latest user message and recent thread (for retrieval).
 * @param {string} message
 * @param {Array<{ role?: string, text?: string }>} [history]
 */
export function buildRagQueryText(message, history) {
  const m = String(message ?? "").trim();
  const h = Array.isArray(history) ? history : [];
  const lastUser = [...h].reverse().find((x) => x?.role === "user");
  const lastAsst = [...h].reverse().find((x) => x?.role === "assistant");
  const parts = [];
  if (lastUser?.text?.trim() && lastUser.text !== m) {
    parts.push(`Earlier: ${lastUser.text.trim().slice(0, 400)}`);
  }
  parts.push(m);
  if (lastAsst?.text?.trim()) {
    parts.push(`Assistant context: ${lastAsst.text.trim().slice(0, 500)}`);
  }
  return parts.join("\n").slice(0, 6000);
}

/**
 * @param {import('@google/genai').GoogleGenAI} ai
 * @param {string} message
 * @param {Array<{ role?: string, text?: string }>} [history]
 * @returns {Promise<{ contextBlock: string, sources: Array<{ id: string, title: string }> }>}
 */
export async function retrieveRagContext(ai, message, history) {
  if (ragDisabled() || corpus.length === 0) {
    return { contextBlock: "", sources: [] };
  }

  try {
    await ensureRagIndexed(ai);
    if (!indexed?.length) return { contextBlock: "", sources: [] };

    const queryText = buildRagQueryText(message, history);
    const [queryVec] = await embedBatch(ai, [queryText], "RETRIEVAL_QUERY");

    const minScore = ragMinScore();
    const scored = indexed.map(({ chunk, vector }) => {
      const cos = cosineSimilarity(queryVec, vector);
      const kw = keywordOverlapRatio(queryText, chunk);
      return {
        chunk,
        score: hybridScore(cos, kw),
        cosine: cos,
      };
    });
    scored.sort((a, b) => b.score - a.score);
    const k = topK();
    const top = scored
      .filter((s) => s.score >= minScore && s.cosine > 0.01)
      .slice(0, k);

    if (top.length === 0) {
      return { contextBlock: "", sources: [] };
    }

    const lines = top.map(
      ({ chunk }) => `[${chunk.title}]\n${chunk.text}`,
    );
    const contextBlock = [
      "Retrieved internal knowledge snippets (themes for navigation and safety—not the user's medical record).",
      "Use to align tone, red flags, and trusted-resource patterns; do not invent private details.",
      "---",
      lines.join("\n\n---\n"),
      "---",
    ].join("\n");

    const sources = top.map(({ chunk }) => ({ id: chunk.id, title: chunk.title }));
    return { contextBlock, sources };
  } catch (e) {
    console.warn("rag: retrieval failed", e?.message ?? e);
    return { contextBlock: "", sources: [] };
  }
}
