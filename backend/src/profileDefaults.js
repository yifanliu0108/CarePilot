/**
 * @typedef {Object} ChatMealPlanContext
 * @property {string} updatedAt — ISO timestamp
 * @property {string[]} symptomsMentioned
 * @property {string[]} categoryBoosts — mealPlan category ids (e.g. digestive)
 * @property {Array<{ day: string, breakfast: string, lunch: string, dinner: string, snacks: string[] }> | null} [weeklyDayMeals] — full week from chat/Gemini
 */

/**
 * @typedef {Object} HealthProfile
 * @property {number | null} age
 * @property {number | null} heightCm
 * @property {number | null} weightKg
 * @property {number | null} bmi
 * @property {number | null} sleepRating — 1–5 focus / concern
 * @property {number | null} cognitiveRating
 * @property {number | null} digestiveRating
 * @property {number | null} musculoskeletalRating
 * @property {number | null} immuneRating
 * @property {boolean} completedOnboarding
 * @property {string[]} [symptomTagIds] — optional quick-check symptom chip ids
 * @property {ChatMealPlanContext | null} [chatMealPlanContext] — last nutrition-chat meal struct (merged into meal plan API)
 */

/** @param {number | null} heightCm @param {number | null} weightKg */
export function computeBmi(heightCm, weightKg) {
  if (heightCm == null || weightKg == null || heightCm <= 0 || weightKg <= 0) return null;
  const m = heightCm / 100;
  const v = weightKg / (m * m);
  return Math.round(v * 10) / 10;
}
