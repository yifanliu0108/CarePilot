/**
 * Must be imported before other app modules so process.env is populated first.
 * (Static imports are hoisted; dotenv at the top of index.js ran after other imports.)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env"), override: true });
