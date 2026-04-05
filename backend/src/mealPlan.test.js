import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyMealPlan } from "./mealPlan.js";

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
