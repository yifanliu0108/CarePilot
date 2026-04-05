/**
 * Must be imported before other app modules so process.env is populated first.
 * (Static imports are hoisted; dotenv at the top of index.js ran after other imports.)
 *
 * Order: repo-root `.env`, then `backend/.env` (override). If backend leaves
 * `GEMINI_API_KEY=` empty (copied from .env.example), we keep a non-empty key from
 * the repo root instead of wiping it.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { normalizeGeminiApiKeyString } from "./geminiNormalizeKey.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });
const rootGeminiKey = normalizeGeminiApiKeyString(process.env.GEMINI_API_KEY);
dotenv.config({ path: path.join(__dirname, "../.env"), override: true });
let merged = normalizeGeminiApiKeyString(process.env.GEMINI_API_KEY);
if (!merged && rootGeminiKey) merged = rootGeminiKey;
process.env.GEMINI_API_KEY = merged;
