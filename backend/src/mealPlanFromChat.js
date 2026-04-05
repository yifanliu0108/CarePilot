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
 * @param {Array<Record<string, unknown>>} baseWeek
 * @param {import('./profileDefaults.js').ChatMealPlanContext | null | undefined} chatCtx
 */
export function mergeWeeklyPlansWithChat(baseWeek, chatCtx) {
  const days = chatCtx?.weeklyDayMeals;
  if (!Array.isArray(days) || days.length !== 7) return baseWeek;
  return baseWeek.map((dayPlan, i) => {
    const o = days[i];
    if (!o) return dayPlan;
    const snacks = (o.snacks || []).filter(Boolean).slice(0, 3).map((t) => mealSlotFromText(t));
    const meals = {
      breakfast: o.breakfast?.trim()
        ? mealSlotFromText(o.breakfast.trim())
        : dayPlan.meals.breakfast,
      lunch: o.lunch?.trim() ? mealSlotFromText(o.lunch.trim()) : dayPlan.meals.lunch,
      dinner: o.dinner?.trim()
        ? mealSlotFromText(o.dinner.trim())
        : dayPlan.meals.dinner,
      snacks: snacks.length >= 1 ? snacks : dayPlan.meals.snacks,
    };
    const chatLine =
      chatCtx?.symptomsMentioned?.length && i === 0
        ? ` Tailored from chat for: ${chatCtx.symptomsMentioned.slice(0, 6).join("; ")}.`
        : "";
    return {
      ...dayPlan,
      dayLabel: o.day?.trim() || dayPlan.dayLabel,
      meals,
      summary: String(dayPlan.summary ?? "") + (i === 0 ? chatLine : ""),
    };
  });
}
