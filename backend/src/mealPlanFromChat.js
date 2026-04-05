/**
 * Structured meal-plan updates from nutrition chat (Gemini JSON).
 * Persisted on profile as chatMealPlanContext; merged into GET /api/me/meal-plan weekly payload.
 */

const VALID_CATEGORIES = new Set([
  "sleep_recovery",
  "cognitive_focus",
  "digestive",
  "musculoskeletal",
  "immune",
]);

const DEFAULT_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * @param {string} sentence
 * @returns {string[]}
 */
function labelsFromSentence(sentence) {
  return sentence
    .split(/[,;]/)
    .map((s) => s.replace(/^[\s.—]+|[\s.—]+$/g, "").trim())
    .filter((s) => s.length > 2 && s.length < 120)
    .slice(0, 12);
}

/**
 * @param {string} text
 */
function mealSlotFromText(text) {
  const t = String(text ?? "").trim();
  return { text: t, labels: t ? labelsFromSentence(t) : [] };
}

/**
 * @param {unknown} raw - mealPlanUpdate from model
 * @returns {{ symptomsMentioned: string[], categoryBoosts: string[], weeklyDayMeals: Array<{ day: string, breakfast: string, lunch: string, dinner: string, snacks: string[] }> | null } | null}
 */
export function coerceMealPlanUpdate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.apply !== true) return null;

  const symptomsMentioned = Array.isArray(o.symptomsMentioned)
    ? o.symptomsMentioned
        .filter((s) => typeof s === "string")
        .map((s) => s.trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const categoryBoosts = Array.isArray(o.categoryBoosts)
    ? [
        ...new Set(
          o.categoryBoosts.filter(
            (s) => typeof s === "string" && VALID_CATEGORIES.has(s),
          ),
        ),
      ]
    : [];

  let weeklyDayMeals = null;
  if (Array.isArray(o.weeklyDayMeals) && o.weeklyDayMeals.length >= 7) {
    const rows = o.weeklyDayMeals.slice(0, 7).map((row, i) => {
      const r = row && typeof row === "object" ? /** @type {Record<string, unknown>} */ (row) : {};
      const day =
        typeof r.day === "string" && r.day.trim()
          ? r.day.trim().slice(0, 16)
          : DEFAULT_DAY_LABELS[i];
      const breakfast = typeof r.breakfast === "string" ? r.breakfast.trim().slice(0, 400) : "";
      const lunch = typeof r.lunch === "string" ? r.lunch.trim().slice(0, 400) : "";
      const dinner = typeof r.dinner === "string" ? r.dinner.trim().slice(0, 400) : "";
      const snacks = Array.isArray(r.snacks)
        ? r.snacks
            .filter((s) => typeof s === "string")
            .map((s) => s.trim().slice(0, 240))
            .filter(Boolean)
            .slice(0, 3)
        : [];
      return { day, breakfast, lunch, dinner, snacks };
    });
    const complete = rows.every((d) => d.breakfast && d.lunch && d.dinner);
    if (complete) weeklyDayMeals = rows;
  }

  if (
    symptomsMentioned.length === 0 &&
    categoryBoosts.length === 0 &&
    !weeklyDayMeals
  ) {
    return null;
  }

  return { symptomsMentioned, categoryBoosts, weeklyDayMeals };
}

/**
 * @param {NonNullable<ReturnType<typeof coerceMealPlanUpdate>>} coerced
 * @returns {import('./profileDefaults.js').ChatMealPlanContext | null}
 */
export function toStoredChatMealContext(coerced) {
  if (!coerced) return null;
  return {
    updatedAt: new Date().toISOString(),
    symptomsMentioned: coerced.symptomsMentioned,
    categoryBoosts: coerced.categoryBoosts,
    weeklyDayMeals: coerced.weeklyDayMeals,
  };
}

/**
 * Merge new chat turn into saved meal-plan context so the planner keeps themes from the whole thread.
 * @param {import('./profileDefaults.js').ChatMealPlanContext | null | undefined} prev
 * @param {{ symptomsMentioned?: string[], categoryBoosts?: string[], weeklyDayMeals?: unknown }} incoming - mealPlanUpdate body (no `apply`)
 * @returns {import('./profileDefaults.js').ChatMealPlanContext | null}
 */
export function mergeStoredChatMealContext(prev, incoming) {
  if (!incoming || typeof incoming !== "object") return null;

  const p = prev && typeof prev === "object" ? prev : null;
  const symMap = new Map();
  for (const s of p?.symptomsMentioned ?? []) {
    const t = String(s).trim();
    if (t) symMap.set(t.toLowerCase().slice(0, 120), t.slice(0, 120));
  }
  const incSym = Array.isArray(incoming.symptomsMentioned) ? incoming.symptomsMentioned : [];
  for (const s of incSym) {
    const t = typeof s === "string" ? s.trim().slice(0, 120) : "";
    if (t) symMap.set(t.toLowerCase(), t);
  }
  const symptomsMentioned = [...symMap.values()].slice(0, 14);

  const catSet = new Set();
  for (const c of p?.categoryBoosts ?? []) {
    if (typeof c === "string" && VALID_CATEGORIES.has(c)) catSet.add(c);
  }
  const incCats = Array.isArray(incoming.categoryBoosts) ? incoming.categoryBoosts : [];
  for (const c of incCats) {
    if (typeof c === "string" && VALID_CATEGORIES.has(c)) catSet.add(c);
  }
  const categoryBoosts = [...catSet].slice(0, 5);

  let weeklyDayMeals = null;
  const incWeek = incoming.weeklyDayMeals;
  if (Array.isArray(incWeek) && incWeek.length === 7) {
    weeklyDayMeals = incWeek;
  } else if (Array.isArray(p?.weeklyDayMeals) && p.weeklyDayMeals.length === 7) {
    weeklyDayMeals = p.weeklyDayMeals;
  }

  if (
    symptomsMentioned.length === 0 &&
    categoryBoosts.length === 0 &&
    !weeklyDayMeals
  ) {
    return null;
  }

  return {
    updatedAt: new Date().toISOString(),
    symptomsMentioned,
    categoryBoosts,
    weeklyDayMeals,
  };
}

/**
 * @param {Record<string, unknown>} dayPlan
 * @param {unknown} oRow
 * @param {import('./profileDefaults.js').ChatMealPlanContext | null | undefined} chatCtx
 * @param {boolean} appendSummaryChat
 */
function applyChatRowToDay(dayPlan, oRow, chatCtx, appendSummaryChat) {
  const o =
    oRow && typeof oRow === "object" ? /** @type {Record<string, unknown>} */ (oRow) : null;
  if (!o) return dayPlan;
  const snacks = (o.snacks || []).filter(Boolean).slice(0, 3).map((t) => mealSlotFromText(t));
  const meals = {
    breakfast: o.breakfast?.trim()
      ? mealSlotFromText(String(o.breakfast).trim())
      : dayPlan.meals.breakfast,
    lunch: o.lunch?.trim() ? mealSlotFromText(String(o.lunch).trim()) : dayPlan.meals.lunch,
    dinner: o.dinner?.trim()
      ? mealSlotFromText(String(o.dinner).trim())
      : dayPlan.meals.dinner,
    snacks: snacks.length >= 1 ? snacks : dayPlan.meals.snacks,
  };
  const chatLine =
    appendSummaryChat && chatCtx?.symptomsMentioned?.length
      ? ` Tailored from chat for: ${chatCtx.symptomsMentioned.slice(0, 6).join("; ")}.`
      : "";
  return {
    ...dayPlan,
    dayLabel: typeof o.day === "string" && o.day.trim() ? o.day.trim().slice(0, 16) : dayPlan.dayLabel,
    meals,
    summary: String(dayPlan.summary ?? "") + chatLine,
  };
}

/** Normalize model day string to Mon…Sun for lookup. */
export function normalizeWeekdayKey(raw) {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  const map = {
    mon: "Mon",
    monday: "Mon",
    tue: "Tue",
    tues: "Tue",
    tuesday: "Tue",
    wed: "Wed",
    wednesday: "Wed",
    thu: "Thu",
    thur: "Thu",
    thurs: "Thu",
    thursday: "Thu",
    fri: "Fri",
    friday: "Fri",
    sat: "Sat",
    saturday: "Sat",
    sun: "Sun",
    sunday: "Sun",
  };
  if (map[lower]) return map[lower];
  if (/^(mon|tue|wed|thu|fri|sat|sun)$/i.test(s.slice(0, 3))) {
    const h = s.slice(0, 3);
    return h.charAt(0).toUpperCase() + h.slice(1).toLowerCase();
  }
  return s.slice(0, 3).charAt(0).toUpperCase() + s.slice(1, 3).toLowerCase();
}

/**
 * @param {Array<Record<string, unknown>>} baseWeek
 * @param {import('./profileDefaults.js').ChatMealPlanContext | null | undefined} chatCtx
 */
export function mergeWeeklyPlansWithChat(baseWeek, chatCtx) {
  const days = chatCtx?.weeklyDayMeals;
  if (!Array.isArray(days) || days.length !== 7) return baseWeek;
  return baseWeek.map((dayPlan, i) =>
    applyChatRowToDay(dayPlan, days[i], chatCtx, i === 0),
  );
}

/**
 * Merge chat overlay onto a week ordered **today → today+6** by matching weekday labels (Mon…Sun).
 * @param {Array<Record<string, unknown>>} rollingWeek
 * @param {import('./profileDefaults.js').ChatMealPlanContext | null | undefined} chatCtx
 */
export function mergeRollingWeekWithChat(rollingWeek, chatCtx) {
  const days = chatCtx?.weeklyDayMeals;
  if (!Array.isArray(days) || days.length !== 7) return rollingWeek;
  /** @type {Map<string, Record<string, unknown>>} */
  const byLabel = new Map();
  for (const row of days) {
    if (!row || typeof row !== "object") continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    const key = normalizeWeekdayKey(typeof r.day === "string" ? r.day : "");
    if (key) byLabel.set(key, r);
  }
  return rollingWeek.map((dayPlan, i) => {
    const label = typeof dayPlan.dayLabel === "string" ? dayPlan.dayLabel : "";
    const o = byLabel.get(label) ?? byLabel.get(normalizeWeekdayKey(label));
    return applyChatRowToDay(dayPlan, o ?? null, chatCtx, i === 0);
  });
}
