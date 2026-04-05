import { mergeRollingWeekWithChat } from "./mealPlanFromChat.js";

/**
 * Daily meal plan from full health snapshot:
 * - Subhealth 1–5: every saved rating contributes weight (r−1)/2; 1 = no pull, 5 = strongest.
 * - Display "concerns" still lists areas rated 3+.
 * - Body metrics: BMI band and age nudge ingredient scores (nutrient-dense vs fiber/lean).
 */

/** Profile field → internal category id */
const PROFILE_KEYS = [
  ["sleepRating", "sleep_recovery"],
  ["cognitiveRating", "cognitive_focus"],
  ["digestiveRating", "digestive"],
  ["musculoskeletalRating", "musculoskeletal"],
  ["immuneRating", "immune"],
];

/**
 * @typedef {Object} CategoryRule
 * @property {string[]} foods — ingredient tokens used in templates + scoring
 * @property {string[]} avoid — guidance strings (aggregated by weight)
 */

/** @type {Record<string, CategoryRule>} */
const CATEGORY_RULES = {
  sleep_recovery: {
    foods: ["oats", "banana", "kiwi", "almonds", "yogurt", "tart_cherry", "milk", "whole_grain", "eggs", "herbal_tea"],
    avoid: ["late caffeine", "heavy late-night meals", "alcohol before bed"],
  },
  cognitive_focus: {
    foods: ["eggs", "berries", "walnuts", "leafy_greens", "whole_grain", "salmon", "green_tea", "yogurt", "avocado"],
    avoid: ["high-sugar snacks", "ultra-processed foods", "energy drink spikes"],
  },
  digestive: {
    foods: ["oats", "ginger", "rice", "yogurt", "banana", "cooked_vegetables", "bone_broth", "white_fish", "sweet_potato"],
    avoid: ["very spicy meals", "large late portions", "excess artificial sweeteners"],
  },
  musculoskeletal: {
    foods: ["salmon", "olive_oil", "leafy_greens", "berries", "nuts", "eggs", "yogurt", "beans", "tofu", "quinoa"],
    avoid: ["chronic excess alcohol", "very low protein intake"],
  },
  immune: {
    foods: ["citrus", "peppers", "broccoli", "garlic", "yogurt", "nuts", "seeds", "beans", "leafy_greens", "berries", "sweet_potato"],
    avoid: ["relying only on supplements", "chronic ultra-processed pattern"],
  },
};

const BALANCED_FOODS = [
  "oats",
  "berries",
  "leafy_greens",
  "whole_grain",
  "yogurt",
  "eggs",
  "beans",
  "olive_oil",
  "nuts",
  "citrus",
];

/**
 * Meal templates: `ingredients` must be tokens from CATEGORY_RULES / BALANCED_FOODS.
 * @type {Record<'breakfast'|'lunch'|'dinner'|'snack', Array<{ text: string, ingredients: string[] }>>}
 */
const MEAL_TEMPLATES = {
  breakfast: [
    { text: "Oatmeal with banana, berries, and almonds; herbal tea or water.", ingredients: ["oats", "banana", "berries", "almonds", "herbal_tea"] },
    { text: "Greek yogurt parfait with berries, walnuts, and a sprinkle of oats.", ingredients: ["yogurt", "berries", "walnuts", "oats"] },
    { text: "Whole-grain toast with eggs and sautéed leafy greens; citrus on the side.", ingredients: ["whole_grain", "eggs", "leafy_greens", "citrus"] },
    { text: "Soft scrambled eggs, white rice or congee, cooked carrots; ginger tea.", ingredients: ["eggs", "rice", "cooked_vegetables", "ginger", "herbal_tea"] },
    { text: "Smoked salmon on whole-grain bread with avocado and cucumber.", ingredients: ["salmon", "whole_grain", "avocado", "cooked_vegetables"] },
  ],
  lunch: [
    { text: "Mediterranean bowl: quinoa, chickpeas, cucumber, tomato, olive oil, grilled chicken or tofu.", ingredients: ["quinoa", "beans", "olive_oil", "tofu", "leafy_greens"] },
    { text: "Large spinach salad with salmon or beans, olive oil vinaigrette, whole-grain roll.", ingredients: ["leafy_greens", "salmon", "beans", "olive_oil", "whole_grain"] },
    { text: "Lentil soup, mixed greens with peppers, orange wedges; olive oil drizzle.", ingredients: ["beans", "leafy_greens", "peppers", "citrus", "olive_oil"] },
    { text: "Grilled white fish, white rice, well-cooked zucchini and carrots.", ingredients: ["white_fish", "rice", "cooked_vegetables"] },
    { text: "Tofu stir-fry with mixed vegetables and brown rice (go easy on sauce).", ingredients: ["tofu", "cooked_vegetables", "whole_grain"] },
  ],
  dinner: [
    { text: "Baked salmon or tempeh, roasted sweet potato, steamed broccoli—eat 2–3h before bed if sleep is a focus.", ingredients: ["salmon", "sweet_potato", "broccoli", "leafy_greens"] },
    { text: "Turkey or bean chili with tomatoes, side salad with olive oil.", ingredients: ["beans", "leafy_greens", "olive_oil", "peppers"] },
    { text: "Grilled chicken or fish, mashed sweet potato, gentle cooked greens.", ingredients: ["white_fish", "sweet_potato", "leafy_greens", "cooked_vegetables"] },
    { text: "Miso soup, rice, steamed fish, and soft cooked vegetables.", ingredients: ["bone_broth", "rice", "white_fish", "cooked_vegetables"] },
    { text: "Whole-wheat pasta with garlic, olive oil, broccoli, and white beans.", ingredients: ["whole_grain", "garlic", "olive_oil", "broccoli", "beans"] },
  ],
  snack: [
    { text: "Apple with almond butter", ingredients: ["berries", "nuts"] },
    { text: "Kiwi and a small cup of yogurt", ingredients: ["kiwi", "yogurt"] },
    { text: "Handful of mixed nuts and dried berries", ingredients: ["nuts", "berries"] },
    { text: "Hummus with cucumber and carrot sticks", ingredients: ["beans", "cooked_vegetables"] },
    { text: "Edamame (lightly salted) and mandarin segments", ingredients: ["beans", "citrus"] },
    { text: "Cheese cube with whole-grain crackers (if tolerated)", ingredients: ["yogurt", "whole_grain"] },
  ],
};

/** @param {number | null | undefined} r */
function clampRating(r) {
  if (typeof r !== "number" || !Number.isFinite(r)) return null;
  const x = Math.round(r);
  if (x < 1 || x > 5) return null;
  return x;
}

/** Subhealth weight: 1→0, 2→0.5, 3→1, 4→1.5, 5→2 (null = skip category). */
function subhealthCategoryWeight(rating) {
  const r = clampRating(rating);
  if (r == null) return null;
  return Math.max(0, r - 1) / 2;
}

/**
 * @param {import('./profileDefaults.js').HealthProfile} profile
 * @returns {Record<string, number>} category → weight
 */
function categoryWeightsFromProfile(profile) {
  /** @type {Record<string, number>} */
  const raw = {};
  for (const [field, cat] of PROFILE_KEYS) {
    const w = subhealthCategoryWeight(profile[field]);
    if (w == null || w <= 0) continue;
    raw[cat] = w;
  }

  const chatBoosts = profile?.chatMealPlanContext?.categoryBoosts;
  if (Array.isArray(chatBoosts)) {
    for (const cat of chatBoosts) {
      if (cat && CATEGORY_RULES[cat]) {
        raw[cat] = (raw[cat] ?? 0) + 0.85;
      }
    }
  }

  const rated = PROFILE_KEYS.map(([field, cat]) => [cat, clampRating(profile[field])])
    .filter(([, r]) => r != null && r >= 2)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  if (rated.length >= 1) {
    const topR = rated[0][1] ?? 0;
    const secondR = rated.length > 1 ? (rated[1][1] ?? 0) : 0;
    if (topR >= secondR + 2) {
      const dom = rated[0][0];
      raw[dom] = (raw[dom] ?? 0) + 1;
    }
  }

  return raw;
}

/**
 * Areas rated 3+ for UI / copy (sorted by rating desc).
 * @param {import('./profileDefaults.js').HealthProfile} profile
 */
function activeConcernCategories(profile) {
  return PROFILE_KEYS.map(([field, cat]) => ({
    cat,
    r: clampRating(profile[field]),
  }))
    .filter((x) => x.r != null && x.r >= 3)
    .sort((a, b) => (b.r ?? 0) - (a.r ?? 0))
    .map((x) => x.cat);
}

/**
 * @param {Record<string, number>} foodScores
 * @param {import('./profileDefaults.js').HealthProfile} profile
 */
function applyBodyMetricBonuses(foodScores, profile) {
  function add(tokens, delta) {
    for (const t of tokens) {
      foodScores[t] = (foodScores[t] ?? 0) + delta;
    }
  }

  const bmi = profile.bmi;
  const age = profile.age;

  if (typeof bmi === "number" && Number.isFinite(bmi)) {
    if (bmi < 18.5) {
      add(
        ["nuts", "eggs", "yogurt", "salmon", "whole_grain", "avocado", "beans", "olive_oil", "oats", "quinoa"],
        1.25,
      );
    } else if (bmi >= 30) {
      add(["leafy_greens", "beans", "white_fish", "citrus", "cooked_vegetables", "broccoli"], 1.5);
      add(["sweet_potato", "berries", "peppers"], 0.75);
    } else if (bmi >= 25) {
      add(["leafy_greens", "beans", "white_fish", "citrus", "cooked_vegetables", "broccoli"], 1);
    }
  }

  if (typeof age === "number" && Number.isFinite(age)) {
    if (age >= 65) {
      add(["yogurt", "white_fish", "eggs", "leafy_greens", "bone_broth", "berries"], 0.65);
    } else if (age >= 10 && age <= 17) {
      add(["whole_grain", "eggs", "yogurt", "beans", "berries"], 0.55);
    }
  }
}

/**
 * @param {import('./profileDefaults.js').HealthProfile} profile
 * @param {string[]} activeConcerns
 */
function buildPlanSummary(profile, activeConcerns) {
  const parts = [];
  const age = profile.age;
  const bmi = profile.bmi;
  const h = profile.heightCm;
  const w = profile.weightKg;

  const bmiLine =
    bmi != null && Number.isFinite(bmi)
      ? bmi < 18.5
        ? "BMI is low—planner favors nutrient-dense ingredients; confirm with a clinician if unintended."
        : bmi >= 30
          ? "BMI is in a higher range—extra lean, high-fiber picks are weighted."
          : bmi >= 25
            ? "BMI above typical range—fiber-forward, lean-protein templates get a boost."
            : "BMI in a common range—variety and balance stay central."
      : h != null && w != null
        ? "Height and weight are saved; BMI will apply once it can be computed."
        : h != null || w != null
          ? "Add both height and weight for BMI-aware meal scoring."
          : "Add body metrics (age, height, weight) for age- and BMI-based tweaks.";

  parts.push(bmiLine);

  if (typeof age === "number" && Number.isFinite(age)) {
    parts.push(
      age >= 65
        ? `Age ${age}: slight emphasis on protein- and calcium-friendly patterns (e.g. yogurt, fish, greens).`
        : age <= 17 && age >= 10
          ? `Age ${age}: growth-friendly whole foods (grains, eggs, legumes) weighted lightly.`
          : `Age ${age}: included in the plan mix.`,
    );
  } else {
    parts.push("Age not set—optional on Health input for age-aware nudges.");
  }

  const subLine =
    activeConcerns.length > 0
      ? `Subhealth: all 1–5 ratings adjust ingredient scores; areas at 3+ (${activeConcerns.join(", ").replace(/_/g, " ")}) lead the overlap.`
      : "Subhealth: every saved 1–5 rating nudges scores (2=mild, 5=strong); none at 3+ yet, so the plan stays broadly balanced plus body-metric boosts.";
  parts.push(subLine);

  return parts.join(" ");
}

/**
 * @param {Record<string, number>} activeWeights
 * @returns {{ foodScores: Record<string, number>, avoidScores: Record<string, number> }}
 */
function scoreFoodsAndAvoids(activeWeights) {
  const foodScores = {};
  const avoidScores = {};

  const cats = Object.keys(activeWeights);
  if (cats.length === 0) {
    for (const f of BALANCED_FOODS) foodScores[f] = 1;
    return { foodScores, avoidScores };
  }

  for (const [cat, w] of Object.entries(activeWeights)) {
    const rule = CATEGORY_RULES[cat];
    if (!rule) continue;
    for (const food of rule.foods) {
      foodScores[food] = (foodScores[food] ?? 0) + w;
    }
    for (const a of rule.avoid) {
      avoidScores[a] = (avoidScores[a] ?? 0) + w;
    }
  }

  return { foodScores, avoidScores };
}

function templateScore(ingredients, foodScores) {
  let s = 0;
  for (const ing of ingredients) s += foodScores[ing] ?? 0;
  return s;
}

/**
 * @param {string[]} ingredients
 * @param {Record<string, number>} usage
 * @param {number} maxPerIngredient
 */
function diversityPenalty(ingredients, usage, maxPerIngredient) {
  let pen = 0;
  for (const ing of ingredients) {
    const u = (usage[ing] ?? 0) + 1;
    if (u > maxPerIngredient) pen += 3 * (u - maxPerIngredient);
  }
  return pen;
}

/**
 * @template T
 * @param {T[]} templates
 * @param {(t: T) => string[]} getIngredients
 * @param {Record<string, number>} foodScores
 * @param {Record<string, number>} usage
 */
/** @param {string} token e.g. leafy_greens */
function ingredientTokenToLabel(token) {
  return String(token)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {string[]} ingredients
 * @returns {string[]}
 */
function labelsFromIngredients(ingredients) {
  return [...new Set(ingredients.map(ingredientTokenToLabel))];
}

/** @param {string} sentence */
function labelsFromFallbackText(sentence) {
  return sentence
    .split(/[,;]/)
    .map((s) => s.replace(/^[\s.—]+|[\s.—]+$/g, "").trim())
    .filter((s) => s.length > 2 && s.length < 120)
    .slice(0, 12);
}

/**
 * @param {{ text: string, ingredients: string[] } | null | undefined} template
 * @param {string} fallbackText
 */
function mealSlot(template, fallbackText) {
  if (template) {
    return {
      text: template.text,
      labels: labelsFromIngredients(template.ingredients),
    };
  }
  return {
    text: fallbackText,
    labels: labelsFromFallbackText(fallbackText),
  };
}

function pickBestTemplate(
  templates,
  getIngredients,
  foodScores,
  usage,
  maxPerIng = 2,
  rotation = 0,
) {
  if (!templates.length) return null;
  const rot = Number(rotation) || 0;
  const scored = templates.map((t, idx) => {
    const ing = getIngredients(t);
    const base = templateScore(ing, foodScores);
    const pen = diversityPenalty(ing, usage, maxPerIng);
    const jitter = (((idx * 31 + rot * 17) % 100) * 0.0015);
    return { t, score: base - pen + jitter, ing };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  for (const i of best.ing) usage[i] = (usage[i] ?? 0) + 1;
  return best.t;
}

/** Monday-based ISO date (local) for this calendar week. */
function mondayIsoThisWeek() {
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const m = new Date(now);
  m.setDate(m.getDate() + diff);
  return m.toISOString().slice(0, 10);
}

function addDaysIso(isoDateStr, days) {
  const d = new Date(`${isoDateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Local calendar date YYYY-MM-DD (avoids UTC drift from toISOString). */
function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIsoLocal(isoDateStr, days) {
  const d = new Date(`${isoDateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

const SHORT_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabelFromIsoLocal(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return SHORT_DOW[d.getDay()];
}

/**
 * @param {import('./profileDefaults.js').HealthProfile} profile
 * @param {{ dayOffset?: number }} [options] — 0–6 varies template picks for weekly variety
 */
export function buildDailyMealPlan(profile, options = {}) {
  const dayOffset = Math.abs(Number(options.dayOffset) || 0) % 7;

  const activeWeights = categoryWeightsFromProfile(profile);
  const activeCategories = activeConcernCategories(profile);

  const { foodScores, avoidScores } = scoreFoodsAndAvoids(activeWeights);
  applyBodyMetricBonuses(foodScores, profile);

  const topFoods = Object.entries(foodScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([food]) => food.replace(/_/g, " "));

  const foodsToLimit = Object.entries(avoidScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([a]) => a);

  const usage = {};
  const breakfastT = pickBestTemplate(
    MEAL_TEMPLATES.breakfast,
    (m) => m.ingredients,
    foodScores,
    usage,
    2,
    dayOffset,
  );
  const lunchT = pickBestTemplate(
    MEAL_TEMPLATES.lunch,
    (m) => m.ingredients,
    foodScores,
    usage,
    2,
    dayOffset + 2,
  );
  const dinnerT = pickBestTemplate(
    MEAL_TEMPLATES.dinner,
    (m) => m.ingredients,
    foodScores,
    usage,
    2,
    dayOffset + 4,
  );

  const snackPool = [...MEAL_TEMPLATES.snack];
  const snack1 = pickBestTemplate(
    snackPool,
    (m) => m.ingredients,
    foodScores,
    usage,
    2,
    dayOffset,
  );
  const snack2 = pickBestTemplate(
    snackPool.filter((s) => s.text !== snack1?.text),
    (m) => m.ingredients,
    foodScores,
    usage,
    2,
    dayOffset + 3,
  );
  const snack3 = pickBestTemplate(
    snackPool.filter(
      (s) => s.text !== snack1?.text && s.text !== snack2?.text,
    ),
    (m) => m.ingredients,
    foodScores,
    usage,
    2,
    dayOffset + 5,
  );

  const summary = buildPlanSummary(profile, activeCategories);

  const snacks = [
    mealSlot(snack1, "Fruit and nuts"),
    mealSlot(snack2, "Yogurt with berries"),
    mealSlot(snack3, "Hummus with vegetables"),
  ].filter((s) => s.text);

  return {
    date: new Date().toISOString().slice(0, 10),
    summary,
    concerns: activeCategories,
    priorityOrder: activeCategories,
    topFoods,
    foodsToLimit,
    meals: {
      breakfast: mealSlot(
        breakfastT,
        "Whole-grain cereal with milk and fruit; water.",
      ),
      lunch: mealSlot(lunchT, "Mixed salad with beans, olive oil, and a whole-grain side."),
      dinner: mealSlot(dinnerT, "Grilled fish or tofu with vegetables and brown rice."),
      snacks,
    },
    hydration: "Aim for water across the day; limit sugary drinks.",
    disclaimer: "Educational meal ideas only—not medical nutrition therapy.",
  };
}

/**
 * Seven days Mon–Sun with varied templates; dates anchored to this week’s Monday.
 * @param {import('./profileDefaults.js').HealthProfile} profile
 */
export function buildWeeklyMealPlans(profile) {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const monday = mondayIsoThisWeek();
  const week = [];
  for (let d = 0; d < 7; d++) {
    const dayPlan = buildDailyMealPlan(profile, { dayOffset: d });
    const { date: _omit, ...rest } = dayPlan;
    week.push({
      dayIndex: d,
      dayLabel: labels[d],
      date: addDaysIso(monday, d),
      ...rest,
    });
  }
  return week;
}

/**
 * Seven consecutive local days starting **today** (index 0 = today), through today+6.
 * Same weekday appears again only when today+6 lands on that weekday (e.g. Sunday → following Saturday).
 * @param {import('./profileDefaults.js').HealthProfile} profile
 */
export function buildRollingWeekMealPlans(profile) {
  const start = todayIsoLocal();
  const week = [];
  for (let i = 0; i < 7; i++) {
    const date = addDaysIsoLocal(start, i);
    const dayPlan = buildDailyMealPlan(profile, { dayOffset: i });
    const { date: _omit, ...rest } = dayPlan;
    week.push({
      dayIndex: i,
      dayLabel: dayLabelFromIsoLocal(date),
      date,
      ...rest,
    });
  }
  return week;
}

/**
 * Daily plan for API + `weeklyPlans` (merged with chat overlay when present).
 * @param {import('./profileDefaults.js').HealthProfile} profile
 */
export function buildMealPlanForApi(profile) {
  let weeklyPlans = buildRollingWeekMealPlans(profile);
  weeklyPlans = mergeRollingWeekWithChat(weeklyPlans, profile.chatMealPlanContext);

  const todayPlan = weeklyPlans[0] ?? buildDailyMealPlan(profile);

  const ctx = profile?.chatMealPlanContext;
  const chatMealPlanContext =
    ctx &&
    typeof ctx === "object" &&
    (ctx.symptomsMentioned?.length ||
      ctx.categoryBoosts?.length ||
      ctx.weeklyDayMeals?.length)
      ? {
          updatedAt: ctx.updatedAt,
          symptomsMentioned: ctx.symptomsMentioned ?? [],
          categoryBoosts: ctx.categoryBoosts ?? [],
          hasWeeklyOverlay: Boolean(ctx.weeklyDayMeals?.length === 7),
        }
      : null;

  return {
    ...todayPlan,
    weeklyPlans,
    chatMealPlanContext,
  };
}

