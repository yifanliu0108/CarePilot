/**
 * Nutrition / subhealth chat: food ideas + browser steps (mock Browser Use shape).
 * Not medical advice — wellness-oriented suggestions only.
 */

const norm = (s) => String(s ?? "").toLowerCase();

const CATEGORIES = {
  sleep: {
    keywords: /\b(sleep|insomnia|rest|recovery|fatigue|tired|circadian)\b/,
    task: "Research sleep-supporting foods and meal timing",
    priceCheckItems: [
      "tart cherry juice",
      "fresh kiwi",
      "pumpkin seeds",
      "chamomile tea caffeine free",
    ],
    assistantLead:
      "For sleep and recovery, many people focus on steady blood sugar, magnesium-rich foods, and avoiding heavy late meals. This is general wellness information—not a substitute for medical care.",
    foods:
      "Try tart cherries or kiwi (small trials suggest possible benefit), complex carbs with dinner, leafy greens, nuts and seeds, and herbal caffeine-free teas. Limit alcohol and large late-night meals.",
    steps: [
      { order: 1, description: "Review your usual dinner time vs bedtime (2–3h gap often helps)", state: "done" },
      { order: 2, description: "Look up magnesium-rich foods on a trusted nutrition reference", state: "pending" },
      { order: 3, description: "Save 2–3 simple evening snack ideas under 200 kcal", state: "pending" },
    ],
    actions: [
      { id: "fdc", label: "USDA FoodData Central (nutrients)", url: "https://fdc.nal.usda.gov/" },
      { id: "sleep-foundation", label: "Sleep hygiene overview (Sleep Foundation)", url: "https://www.sleepfoundation.org/nutrition" },
    ],
  },
  cognitive: {
    keywords: /\b(focus|brain|memory|cognitive|concentration|mental|fog)\b/,
    task: "Find foods associated with focus and cognitive wellness",
    priceCheckItems: [
      "wild salmon fillet",
      "walnuts",
      "blueberries fresh",
      "old fashioned oats",
    ],
    assistantLead:
      "For focus and cognitive wellness, balanced meals with omega-3s, antioxidants, and steady hydration are common themes in public nutrition guidance.",
    foods:
      "Emphasize fatty fish, walnuts, berries, eggs, whole grains, and leafy greens. Spread protein through the day and limit extreme sugar spikes.",
    steps: [
      { order: 1, description: "List your typical breakfast—add protein + fiber if missing", state: "pending" },
      { order: 2, description: "Compare omega-3 food sources on a reference site", state: "pending" },
      { order: 3, description: "Pick one new whole-food snack for mid-morning", state: "pending" },
    ],
    actions: [
      { id: "harvard-nutrition", label: "Harvard Nutrition Source", url: "https://www.hsph.harvard.edu/nutritionsource/" },
      { id: "medline-omega3", label: "MedlinePlus: Omega-3", url: "https://medlineplus.gov/ency/patientinstructions/000727.htm" },
    ],
  },
  digestive: {
    keywords: /\b(gut|digest|bloat|ibs|stomach|constipation|nausea)\b/,
    task: "Explore gentle, fiber-aware eating patterns",
    priceCheckItems: [
      "rolled oats",
      "plain greek yogurt",
      "ginger tea",
      "bananas",
    ],
    assistantLead:
      "Digestive comfort often improves with fiber gradualism, hydration, and identifying personal triggers. See a clinician for persistent symptoms.",
    foods:
      "Consider cooked vegetables, oats, ginger tea, yogurt or kefir if tolerated, and smaller frequent meals. FODMAP or elimination approaches are best guided by a professional.",
    steps: [
      { order: 1, description: "Note foods that reliably worsen symptoms (simple food diary)", state: "pending" },
      { order: 2, description: "Review soluble vs insoluble fiber basics", state: "pending" },
      { order: 3, description: "Find 2 low-FODMAP or bland recipes if you suspect sensitivities", state: "pending" },
    ],
    actions: [
      { id: "iffgd", label: "IFFGD patient resources", url: "https://iffgd.org/" },
      { id: "maps-gi", label: "Find GI dietitian (maps)", url: "https://www.google.com/maps/search/registered+dietitian/" },
    ],
  },
  musculoskeletal: {
    keywords:
      /\b(joint|muscle|pain|back|neck|arthritis|bone|inflammation|hurt|hurts|aching|ache|aches|sore|soreness|stiff|stiffness)\b/,
    task: "Look up anti-inflammatory eating patterns (general)",
    priceCheckItems: [
      "extra virgin olive oil",
      "mixed berries frozen",
      "canned tuna in water",
      "baby spinach",
    ],
    assistantLead:
      "Musculoskeletal comfort is multifactorial. Mediterranean-style patterns are often cited in public health messaging for overall inflammatory balance.",
    foods:
      "Olive oil, colorful vegetables, fatty fish, nuts, and adequate protein for muscle maintenance. Vitamin D and calcium needs depend on your labs and clinician advice.",
    steps: [
      { order: 1, description: "Check protein at each meal (rough target from a calculator)", state: "pending" },
      { order: 2, description: "Browse Mediterranean diet meal ideas", state: "pending" },
      { order: 3, description: "Schedule movement + nutrition as paired habits", state: "pending" },
    ],
    actions: [
      { id: "mediterranean", label: "Oldways Mediterranean diet", url: "https://oldwayspt.org/traditional-diets/mediterranean-diet" },
      { id: "calcium", label: "NIH Calcium fact sheet", url: "https://ods.od.nih.gov/factsheets/Calcium-Consumer/" },
    ],
  },
  immune: {
    keywords: /\b(immune|cold|infection|sick|illness|defense)\b/,
    task: "Review diet patterns that support general immune health",
    priceCheckItems: [
      "oranges navel",
      "broccoli crowns",
      "almonds",
      "plain kefir",
    ],
    assistantLead:
      "No single food prevents illness. Adequate protein, micronutrients from varied plants, sleep, and vaccines (per your clinician) matter most.",
    foods:
      "Citrus, peppers, broccoli, garlic, yogurt/fermented foods if tolerated, nuts, seeds, and plenty of fluids.",
    steps: [
      { order: 1, description: "Audit fruit/vegetable servings for the week", state: "pending" },
      { order: 2, description: "Read CDC adult immunization basics (non-diet)", state: "pending" },
      { order: 3, description: "Plan one soup rich in vegetables + legumes", state: "pending" },
    ],
    actions: [
      { id: "myplate", label: "MyPlate (balanced plates)", url: "https://www.myplate.gov/" },
      { id: "cdc-vaccines", label: "CDC adult vaccines", url: "https://www.cdc.gov/vaccines/adults/index.html" },
    ],
  },
  subhealth: {
    keywords: /\b(subhealth|sub-health|wellness|general|overall|feel off|not sick)\b/,
    task: "Build a balanced plate for subhealth / general wellness",
    priceCheckItems: [
      "boneless chicken breast",
      "brown rice",
      "mixed salad greens",
      "black beans canned",
    ],
    assistantLead:
      "Subhealth usually means feeling run-down without a clear diagnosis. A steady pattern—protein, fiber, plants, hydration, and sleep—creates a strong baseline.",
    foods:
      "Half plate vegetables, quarter lean protein, quarter whole grains; add fruit and nuts as snacks. Reduce ultra-processed foods gradually.",
    steps: [
      { order: 1, description: "Use MyPlate for one full day of meals", state: "pending" },
      { order: 2, description: "Pick one swap (e.g. soda → sparkling water)", state: "pending" },
      { order: 3, description: "Repeat a simple breakfast 5 weekdays", state: "pending" },
    ],
    actions: [
      { id: "myplate", label: "MyPlate", url: "https://www.myplate.gov/" },
      { id: "recipes", label: "Recipe ideas (American Heart Assoc.)", url: "https://www.heart.org/en/healthy-living/healthy-eating/cooking-skills" },
    ],
  },
};

function ratingLine(label, r) {
  if (typeof r !== "number" || r < 1 || r > 5) return null;
  return `${label}: ${r}/5 (1 = minimal focus · 5 = strong focus)`;
}

function profileHints(profile) {
  if (!profile) return "";
  const lines = [
    ratingLine("Sleep & recovery", profile.sleepRating),
    ratingLine("Cognitive & focus", profile.cognitiveRating),
    ratingLine("Digestive", profile.digestiveRating),
    ratingLine("Musculoskeletal", profile.musculoskeletalRating),
    ratingLine("Immune", profile.immuneRating),
  ].filter(Boolean);
  if (lines.length === 0) return "";
  return "\n\nFrom your saved profile:\n" + lines.join("\n");
}

function detectCategory(text, profile) {
  const t = norm(text);
  for (const [key, def] of Object.entries(CATEGORIES)) {
    if (def.keywords.test(t)) return { key, def };
  }
  if (profile) {
    const scored = [
      ["sleep", profile.sleepRating],
      ["cognitive", profile.cognitiveRating],
      ["digestive", profile.digestiveRating],
      ["musculoskeletal", profile.musculoskeletalRating],
      ["immune", profile.immuneRating],
    ]
      .filter(([, r]) => typeof r === "number" && r >= 1 && r <= 5)
      .sort((a, b) => b[1] - a[1]);
    if (scored.length && scored[0][1] >= 3) {
      const key = scored[0][0];
      return { key, def: CATEGORIES[key] };
    }
    if (scored.length) {
      const key = scored[0][0];
      return { key, def: CATEGORIES[key] };
    }
  }
  return { key: "subhealth", def: CATEGORIES.subhealth };
}

/**
 * @param {string} message
 * @param {import('./profileDefaults.js').HealthProfile | null} [profile]
 */
export function nutritionAssist(message, profile = null) {
  const trimmed = String(message ?? "").trim();
  const { key, def } = detectCategory(trimmed || "wellness", profile);
  const hint = profileHints(profile);

  const assistantText = [def.assistantLead, "", def.foods, hint].filter(Boolean).join("\n");

  const id = `nut-${Date.now().toString(36)}`;

  return {
    intent: `nutrition_${key}`,
    assistantText,
    browserSession: {
      id,
      mode: "mock",
      status: "preview",
      task: def.task,
      steps: def.steps,
      actions: def.actions,
      priceCheckItems: def.priceCheckItems ?? [],
      note:
        "Run “Browser Use Cloud” to search Walmart, Vons, and Ralphs for the items above (prices are best-effort; sites may block bots). Not medical advice.",
    },
  };
}
