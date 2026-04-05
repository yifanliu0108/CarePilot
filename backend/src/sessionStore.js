import crypto from "node:crypto";

/**
 * @typedef {Object} Session
 * @property {string} username
 * @property {string} email
 * @property {import('./profileDefaults.js').HealthProfile} profile
 */

const sessions = new Map();

export function createSession(username, email) {
  const id = crypto.randomBytes(24).toString("hex");
  const profile = emptyProfile();
  sessions.set(id, { username: String(username).trim(), email: String(email).trim(), profile });
  return id;
}

function emptyProfile() {
  return {
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
    chatMealPlanContext: null,
  };
}

/** @param {string} sessionId */
export function getSession(sessionId) {
  if (!sessionId || typeof sessionId !== "string") return null;
  return sessions.get(sessionId) ?? null;
}

/** @param {string} sessionId @param {Partial<import("./profileDefaults.js").HealthProfile>} patch */
export function updateProfile(sessionId, patch) {
  const s = getSession(sessionId);
  if (!s) return null;
  s.profile = { ...s.profile, ...patch };
  return s.profile;
}
