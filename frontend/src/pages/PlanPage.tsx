import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/session";

type MealSlot = {
  text: string;
  labels: string[];
};

type MealPlanDay = {
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
  dayIndex?: number;
  dayLabel?: string;
};

type ChatPlanBanner = {
  updatedAt: string;
  symptomsMentioned: string[];
  categoryBoosts: string[];
  hasWeeklyOverlay: boolean;
};

type MealPlanApiResponse = MealPlanDay & {
  weeklyPlans?: MealPlanDay[];
  chatMealPlanContext?: ChatPlanBanner | null;
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

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function MealCard({
  mealTitle,
  slot,
  ariaLabel,
}: {
  mealTitle: string;
  slot: MealSlot | string;
  ariaLabel: string;
}) {
  const { text, labels } = normalizeMealSlot(slot);

  return (
    <article className="cp-meal">
      <h2 className="cp-meal__label">{mealTitle}</h2>
      {labels.length > 0 ? (
        <ul
          className="cp-food-labels cp-food-labels--meal"
          aria-label={ariaLabel}
        >
          {labels.map((f) => (
            <li key={f} className="cp-food-labels__item">
              <span className="cp-food-label">{f}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {text ? <p className="cp-meal__caption">{text}</p> : null}
    </article>
  );
}

function DayMealsGrid({ plan }: { plan: MealPlanDay }) {
  const snacks = plan.meals.snacks.map((s) => normalizeMealSlot(s));
  return (
    <div className="cp-plan__grid">
      <MealCard mealTitle="Breakfast" slot={plan.meals.breakfast} ariaLabel="Breakfast foods" />
      <MealCard mealTitle="Lunch" slot={plan.meals.lunch} ariaLabel="Lunch foods" />
      <MealCard mealTitle="Dinner" slot={plan.meals.dinner} ariaLabel="Dinner foods" />
      {snacks.map((snack, i) => (
        <MealCard
          key={`${snack.text}-${i}`}
          mealTitle={`Snack ${i + 1}`}
          slot={snack}
          ariaLabel={`Snack ${i + 1} foods`}
        />
      ))}
    </div>
  );
}

export default function PlanPage() {
  const [payload, setPayload] = useState<MealPlanApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const weekListRef = useRef<HTMLDivElement>(null);
  const dayDetailsRefs = useRef<Record<string, HTMLDetailsElement | null>>({});

  const todayStr = useMemo(() => todayIsoLocal(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await apiFetch("/api/me/meal-plan");
        const data = (await r.json()) as MealPlanApiResponse & { error?: string };
        if (!r.ok) throw new Error(data.error ?? "Could not load plan");
        if (!cancelled) setPayload(data);
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

  const week = useMemo(() => {
    if (!payload?.weeklyPlans || payload.weeklyPlans.length !== 7) return null;
    return payload.weeklyPlans;
  }, [payload]);

  /** Same planner blurb is often repeated for every day — show once to cut scroll fatigue. */
  const sharedWeekSummary = useMemo(() => {
    if (!week?.length) return null;
    const s0 = week[0].summary?.trim() ?? "";
    if (!s0) return null;
    return week.every((d) => (d.summary?.trim() ?? "") === s0) ? s0 : null;
  }, [week]);

  function focusWeekDay(date: string) {
    const el = dayDetailsRefs.current[date];
    if (!el) return;
    el.open = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function expandCollapseWeek(expand: boolean) {
    const root = weekListRef.current;
    if (!root) return;
    root.querySelectorAll("details.cp-plan__week-section").forEach((node) => {
      if (node instanceof HTMLDetailsElement) node.open = expand;
    });
    if (!expand) {
      const todayEl = dayDetailsRefs.current[todayStr];
      if (todayEl) todayEl.open = true;
    }
  }

  if (loading) {
    return (
      <div className="cp-page cp-page--plan">
        <div className="cp-page__inner">
          <p className="cp-page__sub">Loading meal plan…</p>
        </div>
      </div>
    );
  }

  if (error || !payload) {
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

  const chat = payload.chatMealPlanContext;

  return (
    <div className="cp-page cp-page--plan">
      <div className="cp-page__inner">
        <header className="cp-page__head">
          <h1 className="cp-page__title">{week ? "Weekly meal plan" : "Daily meal plan"}</h1>
          <p className="cp-page__sub">
            {week ? (
              <>
                Seven days starting <strong>today</strong> through the next six days (local calendar). Built from your{" "}
                <strong>Health input</strong> subhealth scores and body metrics; nutrition <strong>chat</strong> can
                add symptom-aware tweaks and a full-week overlay when you describe how you feel.
              </>
            ) : (
              <>
                For {payload.date}. Uses your <strong>body metrics</strong> and{" "}
                <strong>subhealth ratings 1–5</strong> in the planner.
              </>
            )}
          </p>
        </header>

        {chat && (chat.symptomsMentioned.length > 0 || chat.hasWeeklyOverlay) ? (
          <div className="cp-plan__chat-banner" role="status">
            <strong>From your chat:</strong>{" "}
            {chat.symptomsMentioned.length > 0 ? (
              <span>{chat.symptomsMentioned.join(" · ")}</span>
            ) : (
              <span>Meal emphasis updated</span>
            )}
            {chat.hasWeeklyOverlay ? (
              <span> · Full week of meal lines was synced from the assistant.</span>
            ) : (
              <span>
                {" "}
                · Ingredient scoring was nudged
                {chat.categoryBoosts.length > 0
                  ? ` toward: ${chat.categoryBoosts.join(", ").replace(/_/g, " ")}.`
                  : "."}
              </span>
            )}
            <span className="cp-plan__chat-meta">
              {" "}
              (updated {new Date(chat.updatedAt).toLocaleString()})
            </span>
          </div>
        ) : null}

        {week ? (
          <>
            <nav className="cp-plan__week-strip" aria-label="Jump to a day">
              {week.map((day) => {
                const isToday = day.date === todayStr;
                return (
                  <button
                    key={day.date}
                    type="button"
                    className={
                      "cp-plan__day-chip" + (isToday ? " cp-plan__day-chip--today" : "")
                    }
                    onClick={() => focusWeekDay(day.date)}
                  >
                    <span className="cp-plan__day-chip__dow">{day.dayLabel ?? "—"}</span>
                    <span className="cp-plan__day-chip__date">{day.date.slice(5)}</span>
                  </button>
                );
              })}
            </nav>
            <div className="cp-plan__week-toolbar">
              <button type="button" className="cp-plan__toolbar-btn" onClick={() => expandCollapseWeek(true)}>
                Expand all days
              </button>
              <button type="button" className="cp-plan__toolbar-btn" onClick={() => expandCollapseWeek(false)}>
                Collapse to today
              </button>
            </div>
            {sharedWeekSummary ? (
              <details className="cp-plan__rationale">
                <summary className="cp-plan__rationale-summary">How this week&apos;s plan is built</summary>
                <p className="cp-plan__summary cp-plan__summary--compact cp-plan__rationale-body">{sharedWeekSummary}</p>
              </details>
            ) : null}
          </>
        ) : null}

        {!week ? (
          <>
            <p className="cp-plan__summary">{payload.summary}</p>
            {payload.topFoods && payload.topFoods.length > 0 ? (
              <section className="cp-card cp-card--tight" aria-labelledby="plan-foods-heading">
                <h2 id="plan-foods-heading" className="cp-card__title">
                  Ingredients emphasized today
                </h2>
                <ul className="cp-food-labels" aria-label="Foods to emphasize">
                  {payload.topFoods.map((f) => (
                    <li key={f} className="cp-food-labels__item">
                      <span className="cp-food-label">{f}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {payload.foodsToLimit && payload.foodsToLimit.length > 0 ? (
              <section className="cp-card cp-card--tight" aria-labelledby="plan-limit-heading">
                <h2 id="plan-limit-heading" className="cp-card__title">
                  Patterns to ease up on
                </h2>
                <ul className="cp-food-labels" aria-label="Patterns to limit">
                  {payload.foodsToLimit.map((a) => (
                    <li key={a} className="cp-food-labels__item">
                      <span className="cp-food-label cp-food-label--muted">{a}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <DayMealsGrid plan={payload} />
          </>
        ) : (
          <div ref={weekListRef}>
          {week.map((day) => {
            const isToday = day.date === todayStr;
            return (
              <details
                key={`${day.dayLabel}-${day.date}`}
                ref={(el) => {
                  dayDetailsRefs.current[day.date] = el;
                }}
                className="cp-plan__week-section"
                open={isToday}
              >
                <summary className="cp-plan__week-head">
                  {day.dayLabel ?? "Day"} · {day.date}
                  {isToday ? <span className="cp-plan__today-badge"> Today</span> : null}
                </summary>
                {!sharedWeekSummary && day.summary ? (
                  <p className="cp-plan__summary cp-plan__summary--compact">{day.summary}</p>
                ) : null}
                {day.topFoods && day.topFoods.length > 0 ? (
                  <section className="cp-card cp-card--tight" aria-labelledby={`foods-${day.date}`}>
                    <h2 id={`foods-${day.date}`} className="cp-card__title">
                      Ingredients emphasized
                    </h2>
                    <ul className="cp-food-labels" aria-label="Foods to emphasize">
                      {day.topFoods.map((f) => (
                        <li key={f} className="cp-food-labels__item">
                          <span className="cp-food-label">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {day.foodsToLimit && day.foodsToLimit.length > 0 ? (
                  <section className="cp-card cp-card--tight" aria-labelledby={`limit-${day.date}`}>
                    <h2 id={`limit-${day.date}`} className="cp-card__title">
                      Patterns to ease up on
                    </h2>
                    <ul className="cp-food-labels" aria-label="Patterns to limit">
                      {day.foodsToLimit.map((a) => (
                        <li key={a} className="cp-food-labels__item">
                          <span className="cp-food-label cp-food-label--muted">{a}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                <DayMealsGrid plan={day} />
                <section className="cp-card cp-card--tight">
                  <p className="cp-plan__hydration">
                    <strong>Hydration:</strong> {day.hydration}
                  </p>
                  <p className="cp-plan__disclaimer">{day.disclaimer}</p>
                </section>
              </details>
            );
          })}
          </div>
        )}

        {!week ? (
          <section className="cp-card cp-card--tight">
            <p className="cp-plan__hydration">
              <strong>Hydration:</strong> {payload.hydration}
            </p>
            <p className="cp-plan__disclaimer">{payload.disclaimer}</p>
            <Link to="/chat" className="cp-btn cp-btn--secondary cp-plan__discuss">
              Discuss in chat
            </Link>
          </section>
        ) : (
          <section className="cp-card cp-card--tight">
            <Link to="/chat" className="cp-btn cp-btn--secondary cp-plan__discuss">
              Update from chat
            </Link>
            <p className="cp-plan__disclaimer" style={{ marginTop: "0.75rem" }}>
              Mention symptoms or goals in nutrition chat (with Gemini enabled) to refresh this week&apos;s structure.
              Browser Use grocery runs stay separate—use them to price-check items the assistant suggests.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
