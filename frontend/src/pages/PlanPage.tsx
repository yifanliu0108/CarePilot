import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/session";

type MealSlot = {
  text: string;
  labels: string[];
};

type MealPlan = {
  date: string;
  summary: string;
  concerns: string[];
  priorityOrder?: string[];
  topFoods?: string[];
  foodsToLimit?: string[];
  meals: {
    breakfast: MealSlot | string;
    lunch: MealSlot | string;
    dinner: MealSlot | string;
    snacks: (MealSlot | string)[];
  };
  hydration: string;
  disclaimer: string;
};

function legacyLabelsFromSentence(s: string): string[] {
  return s
    .split(/[,;]/)
    .map((x) => x.replace(/^[\s.—]+|[\s.—]+$/g, "").trim())
    .filter((x) => x.length > 2)
    .slice(0, 12);
}

function normalizeMealSlot(raw: MealSlot | string): MealSlot {
  if (raw != null && typeof raw === "object" && "text" in raw) {
    const o = raw as MealSlot;
    const labels = Array.isArray(o.labels) ? o.labels : [];
    return { text: String(o.text ?? ""), labels };
  }
  const text = String(raw ?? "");
  return { text, labels: legacyLabelsFromSentence(text) };
}

function buildShopRecipePrompt(mealTitle: string, labels: string[], recipeSummary: string): string {
  const ingredients =
    labels.length > 0 ? labels.join(", ") : recipeSummary.trim().slice(0, 280) || "general pantry items";
  return `From my meal plan (${mealTitle}), I need to shop for these ingredients: ${ingredients}. Please give me a concise grocery list and any simple substitutions if something is unavailable.`;
}

function MealShopCard({
  mealTitle,
  slot,
  ariaLabel,
}: {
  mealTitle: string;
  slot: MealSlot | string;
  ariaLabel: string;
}) {
  const navigate = useNavigate();
  const { text, labels } = normalizeMealSlot(slot);

  function goShopRecipe() {
    navigate("/chat", {
      state: { shopRecipeDraft: buildShopRecipePrompt(mealTitle, labels, text) },
    });
  }

  return (
    <article className="cp-meal cp-meal--interactive">
      <div className="cp-meal__inner">
        <h2 className="cp-meal__label">{mealTitle}</h2>
        {labels.length > 0 ? (
          <ul className="cp-food-labels cp-food-labels--meal" aria-label={ariaLabel}>
            {labels.map((f) => (
              <li key={f} className="cp-food-labels__item">
                <span className="cp-food-label">{f}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {text ? <p className="cp-meal__caption">{text}</p> : null}
        <button
          type="button"
          className="cp-meal__shop-fallback"
          onClick={goShopRecipe}
        >
          Shop recipe
        </button>
      </div>
      <div className="cp-meal__hover-layer">
        <button type="button" className="cp-btn cp-btn--primary cp-meal__shop-btn" onClick={goShopRecipe}>
          Shop recipe
        </button>
      </div>
    </article>
  );
}

export default function PlanPage() {
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await apiFetch("/api/me/meal-plan");
        const data = (await r.json()) as MealPlan & { error?: string };
        if (!r.ok) throw new Error(data.error ?? "Could not load plan");
        if (!cancelled) setPlan(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="cp-page cp-page--plan">
        <div className="cp-page__inner">
          <p className="cp-page__sub">Loading meal plan…</p>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="cp-page cp-page--plan">
        <div className="cp-page__inner">
          <p className="cp-form__error" role="alert">
            {error ?? "No plan"}
          </p>
          <Link to="/input" className="cp-inline-link">
            Complete your profile
          </Link>
        </div>
      </div>
    );
  }

  const snacks = plan.meals.snacks.map((s) => normalizeMealSlot(s));

  return (
    <div className="cp-page cp-page--plan">
      <div className="cp-page__inner">
      <header className="cp-page__head">
        <h1 className="cp-page__title">Daily meal plan</h1>
        <p className="cp-page__sub">
          For {plan.date}. Uses your <strong>body metrics</strong> and <strong>subhealth ratings 1–5</strong> in
          the planner. Hover a meal for <strong>Shop recipe</strong> to open chat with ingredients ready to send.
        </p>
      </header>

      <p className="cp-plan__summary">{plan.summary}</p>

      {plan.topFoods && plan.topFoods.length > 0 ? (
        <section className="cp-card cp-card--tight" aria-labelledby="plan-foods-heading">
          <h2 id="plan-foods-heading" className="cp-card__title">
            Ingredients emphasized today
          </h2>
          <ul className="cp-food-labels" aria-label="Foods to emphasize">
            {plan.topFoods.map((f) => (
              <li key={f} className="cp-food-labels__item">
                <span className="cp-food-label">{f}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.foodsToLimit && plan.foodsToLimit.length > 0 ? (
        <section className="cp-card cp-card--tight" aria-labelledby="plan-limit-heading">
          <h2 id="plan-limit-heading" className="cp-card__title">
            Patterns to ease up on
          </h2>
          <ul className="cp-food-labels" aria-label="Patterns to limit">
            {plan.foodsToLimit.map((a) => (
              <li key={a} className="cp-food-labels__item">
                <span className="cp-food-label cp-food-label--muted">{a}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="cp-plan__grid cp-plan__grid--shop">
        <MealShopCard mealTitle="Breakfast" slot={plan.meals.breakfast} ariaLabel="Breakfast foods" />
        <MealShopCard mealTitle="Lunch" slot={plan.meals.lunch} ariaLabel="Lunch foods" />
        <MealShopCard mealTitle="Dinner" slot={plan.meals.dinner} ariaLabel="Dinner foods" />
        {snacks.map((snack, i) => (
          <MealShopCard
            key={`${snack.text}-${i}`}
            mealTitle={`Snack ${i + 1}`}
            slot={snack}
            ariaLabel={`Snack ${i + 1} foods`}
          />
        ))}
      </div>

      <section className="cp-card cp-card--tight">
        <p className="cp-plan__hydration">
          <strong>Hydration:</strong> {plan.hydration}
        </p>
        <p className="cp-plan__disclaimer">{plan.disclaimer}</p>
        <Link to="/chat" className="cp-btn cp-btn--secondary cp-plan__discuss">
          Discuss in chat
        </Link>
      </section>
      </div>
    </div>
  );
}
