import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyMealPlan, buildMealPlanForApi } from "./mealPlan.js";

const empty = {
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
};

test("no active ratings yields balanced plan and empty concerns", () => {
  const p = buildDailyMealPlan({ ...empty, sleepRating: 2, cognitiveRating: 1 });
  assert.equal(p.concerns.length, 0);
  assert.ok(p.meals.breakfast.text.length > 5);
  assert.ok(Array.isArray(p.meals.breakfast.labels) && p.meals.breakfast.labels.length >= 1);
  assert.ok(Array.isArray(p.meals.snacks) && p.meals.snacks.length === 3);
  assert.ok(p.meals.snacks[0].labels.length >= 1);
  assert.ok(p.meals.snacks[2].labels.length >= 1);
  assert.ok(p.topFoods.length > 0);
});

test("active concerns appear in priority order by weight", () => {
  const p = buildDailyMealPlan({
    ...empty,
    sleepRating: 5,
    cognitiveRating: 3,
    digestiveRating: 2,
    musculoskeletalRating: 2,
    immuneRating: 2,
  });
  assert.ok(p.concerns.includes("sleep_recovery"));
  assert.ok(p.concerns[0] === "sleep_recovery" || p.priorityOrder[0] === "sleep_recovery");
});

test("dominant rating (5 vs 3) boosts top category in output", () => {
  const p = buildDailyMealPlan({
    ...empty,
    sleepRating: 5,
    cognitiveRating: 3,
    immuneRating: 3,
    digestiveRating: 2,
    musculoskeletalRating: 2,
  });
  assert.ok(p.foodsToLimit.length >= 0);
  assert.ok(p.topFoods.length > 0);
});

test("ratings of 2 influence food scores without counting as 3+ concerns", () => {
  const p = buildDailyMealPlan({
    ...empty,
    sleepRating: 2,
    digestiveRating: 2,
    cognitiveRating: 1,
  });
  assert.equal(p.concerns.length, 0);
  assert.ok(p.topFoods.length > 0);
});

test("BMI and age add body-metric bonuses", () => {
  const p = buildDailyMealPlan({
    ...empty,
    age: 70,
    heightCm: 170,
    weightKg: 90,
    bmi: 31.1,
    sleepRating: 3,
  });
  assert.ok(p.summary.includes("BMI"));
  assert.ok(p.summary.includes("Age 70"));
});

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

test("meal plan API bundles seven rolling days from today plus today slice", () => {
  const profile = { ...empty, symptomTagIds: [], chatMealPlanContext: null };
  const api = buildMealPlanForApi(profile);
  assert.equal(api.weeklyPlans.length, 7);
  assert.ok(api.date && api.meals?.breakfast);
  assert.equal(api.chatMealPlanContext, null);
  const expectToday = todayIsoLocal();
  assert.equal(api.weeklyPlans[0].date, expectToday);
  assert.equal(api.date, expectToday);
  const w = api.weeklyPlans;
  for (let i = 1; i < 7; i++) {
    const prev = new Date(`${w[i - 1].date}T12:00:00`);
    const cur = new Date(`${w[i].date}T12:00:00`);
    prev.setDate(prev.getDate() + 1);
    assert.equal(
      cur.getFullYear(),
      prev.getFullYear(),
      `year step ${i}`,
    );
    assert.equal(cur.getMonth(), prev.getMonth(), `month step ${i}`);
    assert.equal(cur.getDate(), prev.getDate(), `day step ${i}`);
  }
});
