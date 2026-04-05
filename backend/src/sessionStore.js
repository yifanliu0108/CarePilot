import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {Object} Session
 * @property {string} username
 * @property {string} email
 * @property {import('./profileDefaults.js').HealthProfile} profile
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE = resolveStoreFile();
const store = loadStore();

function resolveStoreFile() {
  const override = process.env.SESSION_STORE_FILE?.trim();
  if (override) return path.resolve(override);
  return path.resolve(__dirname, "../data/auth-store.json");
}

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      users:
        parsed && typeof parsed.users === "object" && !Array.isArray(parsed.users)
          ? parsed.users
          : {},
      sessions:
        parsed && typeof parsed.sessions === "object" && !Array.isArray(parsed.sessions)
          ? parsed.sessions
          : {},
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { users: {}, sessions: {} };
    }
    console.warn(
      `Session store load failed (${STORE_FILE}):`,
      error?.message ?? error,
    );
    return { users: {}, sessions: {} };
  }
}

function saveStore() {
  const dir = path.dirname(STORE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

function normalizeUsername(username) {
  return String(username ?? "")
    .trim()
    .slice(0, 80);
}

function normalizeEmail(email) {
  return String(email ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 320);
}

function nowIso() {
  return new Date().toISOString();
}

function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  for (const user of Object.values(store.users)) {
    if (user?.email === normalized) return user;
  }
  return null;
}

function getSessionRecord(sessionId) {
  if (!sessionId || typeof sessionId !== "string") return null;
  return store.sessions[sessionId] ?? null;
}

function getUserForSession(sessionId) {
  const record = getSessionRecord(sessionId);
  if (!record) return null;
  const user = store.users[record.userId] ?? null;
  if (!user) {
    delete store.sessions[sessionId];
    saveStore();
    return null;
  }
  return user;
}

export function createSession(username, email) {
  const id = crypto.randomBytes(24).toString("hex");
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);
  const stampedAt = nowIso();

  let user = getUserByEmail(cleanEmail);
  if (user) {
    user.username = cleanUsername || user.username;
    user.updatedAt = stampedAt;
  } else {
    user = {
      id: crypto.randomBytes(16).toString("hex"),
      username: cleanUsername,
      email: cleanEmail,
      profile: emptyProfile(),
      createdAt: stampedAt,
      updatedAt: stampedAt,
    };
    store.users[user.id] = user;
  }

  store.sessions[id] = {
    id,
    userId: user.id,
    createdAt: stampedAt,
  };
  saveStore();
  return id;
}

function emptyProfile() {
  return {
    displayName: null,
    age: null,
    heightCm: null,
    weightKg: null,
    bmi: null,
    sleepRating: null,
    cognitiveRating: null,
    digestiveRating: null,
    musculoskeletalRating: null,
    immuneRating: null,
    completedOnboarding: false,
    symptomTagIds: [],
    /** Short wellness goals (user-entered). */
    healthFocus: null,
    /** Conditions / concerns in the user's words (user-entered). */
    conditionsSummary: null,
    /** Visits / labs — user summary only (not verified). */
    visitLabSummary: null,
    chatMealPlanContext: null,
  };
}

/** @param {string} sessionId */
export function getSession(sessionId) {
  const user = getUserForSession(sessionId);
  if (!user) return null;
  return {
    username: user.username,
    email: user.email,
    profile: {
      ...emptyProfile(),
      ...(user.profile ?? {}),
    },
  };
}

/** @param {string} sessionId @param {Partial<import("./profileDefaults.js").HealthProfile>} patch */
export function updateProfile(sessionId, patch) {
  const user = getUserForSession(sessionId);
  if (!user) return null;
  user.profile = {
    ...emptyProfile(),
    ...(user.profile ?? {}),
    ...patch,
  };
  user.updatedAt = nowIso();
  saveStore();
  return user.profile;
}

/** @param {string} sessionId */
export function deleteSession(sessionId) {
  if (!sessionId || typeof sessionId !== "string") return false;
  if (!store.sessions[sessionId]) return false;
  delete store.sessions[sessionId];
  saveStore();
  return true;
}
