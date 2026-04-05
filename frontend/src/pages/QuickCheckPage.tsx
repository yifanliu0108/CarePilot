import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { HeroBackdrop } from "../components/HeroBackdrop";
import { apiFetch } from "../api/session";
import { useSession, type HealthProfile } from "../context/SessionContext";
import {
  domainBreakdown,
  illnessLikelihoodIndexPercent,
  LIKERT_OPTIONS_VISUAL,
  overallRisk,
  QUICK_QUESTIONS,
  risksFromAnswers,
  signalStrengthPercent,
  symptomsOnlyLikelihoodPercent,
  type RiskRow,
} from "../lib/quickCheck";
import { SYMPTOM_WIZARD_PAGES } from "../lib/symptomTags";

const SIGNAL_RING_R = 54;
const SIGNAL_RING_C = 2 * Math.PI * SIGNAL_RING_R;

function SubhealthScoreRing({
  percent,
  answerPercent,
  earlySignalBump,
  earlySignalCount,
}: {
  percent: number;
  answerPercent: number;
  earlySignalBump: number;
  earlySignalCount: number;
}) {
  const p = Math.min(100, Math.max(0, Math.round(percent)));
  const offset = SIGNAL_RING_C * (1 - p / 100);
  const tier = p < 34 ? "low" : p < 67 ? "mid" : "high";
  return (
    <div
      className="cp-quick__signal-hero"
      role="group"
      aria-label={`Subhealth score ${p} percent. Weighted answers contribute ${answerPercent} percent; ${earlySignalCount} early signal tags add ${earlySignalBump} percent. Educational index, not medical advice.`}
    >
      <div className="cp-quick__signal-ring-wrap">
        <svg className="cp-quick__signal-ring" viewBox="0 0 128 128" aria-hidden>
          <circle className="cp-quick__signal-ring-track" cx={64} cy={64} r={SIGNAL_RING_R} fill="none" />
          <circle
            className={`cp-quick__signal-ring-fill cp-quick__signal-ring-fill--${tier}`}
            cx={64}
            cy={64}
            r={SIGNAL_RING_R}
            fill="none"
            strokeDasharray={SIGNAL_RING_C}
            strokeDashoffset={offset}
            transform="rotate(-90 64 64)"
          />
        </svg>
        <div className="cp-quick__signal-ring-center">
          <span className="cp-quick__signal-pct">{p}</span>
          <span className="cp-quick__signal-pct-unit" aria-hidden>
            %
          </span>
        </div>
      </div>
      <p className="cp-quick__signal-title">Subhealth score</p>
      {earlySignalCount > 0 ? (
        <p className="cp-quick__likelihood-split">
          Answers <strong>{answerPercent}%</strong> · Early signals <strong>+{earlySignalBump}%</strong> (
          {earlySignalCount} selected)
        </p>
      ) : (
        <p className="cp-quick__likelihood-split">Based on Likert answers only — you didn&apos;t add early signals.</p>
      )}
    </div>
  );
}

function QuickCheckShell({
  children,
  scroll,
  showBrandNav = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** When false, top “CarePilot” link is hidden (signed-in users use sidebar + logo). */
  showBrandNav?: boolean;
}) {
  return (
    <div
      id="cp-quick-check-page"
      className={
        "cp-page cp-page--quick" +
        (scroll ? " cp-page--quick--scroll" : "") +
        (!showBrandNav ? " cp-page--quick--no-topnav" : "")
      }
    >
      <HeroBackdrop />
      {showBrandNav ? (
        <header className="cp-quick__nav" aria-label="Site">
          <Link to="/" className="cp-quick__nav-brand">
            CarePilot
          </Link>
        </header>
      ) : null}
      {children}
    </div>
  );
}

function buildProfileBody(
  existing: RiskRow,
  profile: HealthProfile | undefined,
  symptomTagIds: string[],
) {
  const p = profile;
  return {
    age: p?.age ?? null,
    heightCm: p?.heightCm ?? null,
    weightKg: p?.weightKg ?? null,
    bmi: p?.bmi ?? null,
    sleepRating: existing.sleep,
    cognitiveRating: existing.focus,
    immuneRating: existing.stress,
    musculoskeletalRating: Math.max(existing.energy, existing.pain),
    digestiveRating: p?.digestiveRating ?? 3,
    symptomTagIds,
    completedOnboarding: true,
  };
}

export default function QuickCheckPage() {
  const { me, refreshMe, sessionId } = useSession();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [phase, setPhase] = useState<"likert" | "symptoms" | "result">("likert");
  const [symptomStep, setSymptomStep] = useState(0);
  const [selectedSymptomIds, setSelectedSymptomIds] = useState<string[]>([]);
  const [savedSymptomIds, setSavedSymptomIds] = useState<string[]>([]);
  const [riskRow, setRiskRow] = useState<RiskRow | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Brief “selected” state with checkmark before advancing (16p-style) */
  const [selectedRisk, setSelectedRisk] = useState<number | null>(null);
  const pickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== "symptoms") return;
    const el = document.getElementById("cp-quick-check-page");
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [phase, symptomStep]);

  const q = QUICK_QUESTIONS[step];
  const total = QUICK_QUESTIONS.length;

  const finish = useCallback(
    async (finalAnswers: number[], symptomTagIds: string[]) => {
      const risks = risksFromAnswers(finalAnswers);
      const ov = overallRisk(risks);
      setRiskRow(risks);
      setScore(Math.round(ov * 10) / 10);
      setSavedSymptomIds(symptomTagIds);
      setPhase("result");
      setSaveError(null);
      if (!sessionId) {
        setSaving(false);
        return;
      }
      setSaving(true);
      try {
        const body = buildProfileBody(risks, me?.profile ?? undefined, symptomTagIds);
        const r = await apiFetch("/api/me/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await r.json()) as { error?: string };
        if (!r.ok) throw new Error(data.error ?? "Could not save");
        await refreshMe();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [me?.profile, refreshMe, sessionId],
  );

  function pickOption(risk: number) {
    const next = [...answers, risk];
    if (step < total - 1) {
      setAnswers(next);
      setStep(step + 1);
    } else {
      setAnswers(next);
      setPhase("symptoms");
      setSymptomStep(0);
    }
  }

  function toggleSymptom(id: string) {
    setSelectedSymptomIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function onSymptomContinue() {
    if (symptomStep < SYMPTOM_WIZARD_PAGES.length - 1) {
      setSymptomStep((s) => s + 1);
      return;
    }
    void finish(answers, selectedSymptomIds);
  }

  function backFromSymptoms() {
    if (symptomStep > 0) {
      setSymptomStep((s) => s - 1);
      return;
    }
    setPhase("likert");
    setAnswers((a) => a.slice(0, -1));
    setStep(total - 1);
  }

  function onPickLikert(risk: number) {
    if (selectedRisk != null) return;
    setSelectedRisk(risk);
    pickTimerRef.current = setTimeout(() => {
      pickTimerRef.current = null;
      setSelectedRisk(null);
      pickOption(risk);
    }, 220);
  }

  function goBackLikert() {
    if (step === 0) return;
    setSelectedRisk(null);
    setAnswers((a) => a.slice(0, -1));
    setStep(step - 1);
  }

  if (phase === "result") {
    const row = riskRow ?? risksFromAnswers(answers);
    const answerPct = score != null ? signalStrengthPercent(score) : 0;
    const likelihoodPct =
      score != null
        ? illnessLikelihoodIndexPercent(score, savedSymptomIds.length)
        : symptomsOnlyLikelihoodPercent(savedSymptomIds.length);
    const bumpApplied = Math.max(0, likelihoodPct - answerPct);
    const breakdown = domainBreakdown(row);

    return (
      <QuickCheckShell scroll showBrandNav={!sessionId}>
        <div className="cp-page__inner cp-quick cp-quick--result">
          <header className="cp-quick__result-top">
            <SubhealthScoreRing
              percent={likelihoodPct}
              answerPercent={answerPct}
              earlySignalBump={bumpApplied}
              earlySignalCount={savedSymptomIds.length}
            />

            <section className="cp-quick__weights" aria-labelledby="quick-weights-h">
              <h2 id="quick-weights-h" className="cp-quick__weights-title">
                Weighted inputs
              </h2>
              <p className="cp-quick__weights-lede">
                Each row is one question&apos;s option (1–5). Weights match the blended score and the answer portion of
                your subhealth score; tags from Early signals add extra percentage on top (see above).
              </p>
              <ul className="cp-quick__weights-list">
                {breakdown.map((d) => {
                  const frac = Math.min(1, Math.max(0, (d.risk - 1) / 4));
                  return (
                    <li key={d.key} className="cp-quick__weight-item">
                      <div className="cp-quick__weight-item-head">
                        <span className="cp-quick__weight-label">{d.label}</span>
                        <span className="cp-quick__weight-meta">
                          <span className="cp-quick__weight-pct">{d.weightPct}%</span>
                          <span className="cp-quick__weight-risk" aria-label={`Risk level ${d.risk} out of 5`}>
                            {d.risk}/5
                          </span>
                        </span>
                      </div>
                      <div
                        className="cp-quick__weight-bar"
                        role="presentation"
                        style={{ "--cp-weight-fill": String(frac) } as CSSProperties}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="cp-quick__result-cta" aria-labelledby="quick-result-cta-h">
              <h2 id="quick-result-cta-h" className="cp-visually-hidden">
                Save check-in and next steps
              </h2>
              {!sessionId ? (
                <>
                  <p className="cp-quick__result-cta-lede">
                    Sign in to save this check-in to your profile. You&apos;ll get the sidebar:{" "}
                    <strong>Quick check</strong>, <strong>Health input</strong>, <strong>Chat</strong>, and{" "}
                    <strong>Meal plan</strong>. Re-run quick check anytime from the nav or from <strong>Profile</strong>.
                  </p>
                  <Link
                    to="/login"
                    state={{ from: "/quick-check" }}
                    className="cp-btn cp-btn--primary cp-quick__result-cta-primary"
                  >
                    Sign in
                  </Link>
                </>
              ) : (
                <>
                  {saving ? <p className="cp-quick__saving">Saving your snapshot…</p> : null}
                  {!saving ? (
                    <p className="cp-quick__result-cta-lede cp-quick__result-cta-lede--signed">
                      This check-in is saved to your profile. Use the sidebar for <strong>Quick check</strong>,{" "}
                      <strong>Health input</strong>, <strong>Chat</strong>, and <strong>Meal plan</strong>, or open{" "}
                      <strong>Profile</strong> to run quick check again.
                    </p>
                  ) : null}
                </>
              )}
              {saveError ? (
                <p className="cp-form__error cp-quick__result-cta-error" role="alert">
                  {saveError}
                </p>
              ) : null}
            </section>
          </header>
        </div>
      </QuickCheckShell>
    );
  }

  if (phase === "symptoms") {
    const page = SYMPTOM_WIZARD_PAGES[symptomStep];
    return (
      <QuickCheckShell scroll showBrandNav={!sessionId}>
        <div className="cp-page__inner cp-quick cp-quick--symptoms">
          <header className="cp-quick__symptom-top">
            <div className="cp-quick__symptom-kicker">
              <p className="cp-quick__eyebrow">{page.title}</p>
              <span className="cp-quick__symptom-count" aria-hidden="true">
                {symptomStep + 1}/{SYMPTOM_WIZARD_PAGES.length}
              </span>
            </div>
            <div
              className="cp-quick__symptom-progress"
              role="progressbar"
              aria-valuenow={symptomStep + 1}
              aria-valuemin={1}
              aria-valuemax={SYMPTOM_WIZARD_PAGES.length}
              aria-label={`Step ${symptomStep + 1} of ${SYMPTOM_WIZARD_PAGES.length}`}
            >
              <div
                className="cp-quick__symptom-progress-fill"
                style={{
                  width: `${((symptomStep + 1) / SYMPTOM_WIZARD_PAGES.length) * 100}%`,
                }}
              />
            </div>
            {symptomStep === 0 ? (
              <p className="cp-quick__symptom-trust">Optional · not medical advice</p>
            ) : null}
          </header>

          <section
            key={symptomStep}
            className="cp-symptom__section"
            aria-labelledby={`sym-sec-${page.sectionId}-${symptomStep}`}
          >
            <h2 id={`sym-sec-${page.sectionId}-${symptomStep}`} className="cp-symptom__topic">
              <span className="cp-symptom__topic-text">{page.topicHeading}</span>
              {page.topicPart ? (
                <span className="cp-symptom__topic-part" aria-label={`Section part ${page.topicPart}`}>
                  {page.topicPart}
                </span>
              ) : null}
            </h2>
            <div className="cp-symptom__chips cp-symptom__chips--stack" role="group">
              {page.items.map((item) => {
                const on = selectedSymptomIds.includes(item.id);
                const aria = item.hint ? `${item.label}. ${item.hint}` : item.label;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={"cp-symptom__chip cp-symptom__chip--simple" + (on ? " cp-symptom__chip--on" : "")}
                    aria-pressed={on}
                    title={item.hint}
                    aria-label={aria}
                    onClick={() => toggleSymptom(item.id)}
                  >
                    <span className="cp-symptom__chip-check" aria-hidden>
                      {on ? "✓" : ""}
                    </span>
                    <span className="cp-symptom__chip-text">
                      <span className="cp-symptom__chip-label">{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="cp-quick__symptom-actions">
            <button type="button" className="cp-btn cp-btn--primary cp-quick__symptom-next" onClick={onSymptomContinue}>
              {symptomStep < SYMPTOM_WIZARD_PAGES.length - 1 ? "Next" : "See results"}
            </button>
            <button
              type="button"
              className="cp-quick__symptom-skip-link"
              onClick={() => void finish(answers, [])}
            >
              Skip to snapshot
            </button>
          </div>

          <div className="cp-quick__footer">
            <button type="button" className="cp-quick__back" onClick={backFromSymptoms}>
              ← Back
            </button>
            <Link to="/" className="cp-quick__exit">
              Exit
            </Link>
          </div>
        </div>
      </QuickCheckShell>
    );
  }

  return (
    <QuickCheckShell showBrandNav={!sessionId}>
      <div className="cp-page__inner cp-quick cp-quick--likert">
        <header className="cp-quick__head">
          <p className="cp-quick__eyebrow">Quick check</p>
          <ol className="cp-quick__steps" aria-label="Check-in progress">
            {Array.from({ length: total }, (_, i) => (
              <li key={i} className="cp-quick__step-item">
                <span
                  className={
                    "cp-quick__step-dot" +
                    (i < step ? " cp-quick__step-dot--done" : "") +
                    (i === step ? " cp-quick__step-dot--current" : "") +
                    (i > step ? " cp-quick__step-dot--upcoming" : "")
                  }
                  aria-hidden
                />
              </li>
            ))}
          </ol>
        </header>

        <section className="cp-quick__card" aria-labelledby={`quick-q-${q.id}`}>
          <p className="cp-quick__factor" id={`quick-factor-${q.id}`}>
            {q.factorLabel}
          </p>
          <h1
            className="cp-quick__statement"
            id={`quick-q-${q.id}`}
            aria-describedby={`quick-factor-${q.id}`}
          >
            {q.prompt}
          </h1>
          <div className="cp-quick__likert" role="radiogroup" aria-labelledby={`quick-q-${q.id}`}>
            <span className="cp-quick__pole cp-quick__pole--disagree">Disagree</span>
            <div className="cp-quick__scale">
              {LIKERT_OPTIONS_VISUAL.map((opt, i) => (
                <button
                  key={opt.risk}
                  type="button"
                  className={
                    "cp-quick__likert-btn cp-quick__likert-btn--s" +
                    (LIKERT_OPTIONS_VISUAL.length - 1 - i) +
                    (selectedRisk === opt.risk ? " cp-quick__likert-btn--selected" : "")
                  }
                  aria-label={`${opt.label}. ${q.prompt}`}
                  disabled={selectedRisk != null && selectedRisk !== opt.risk}
                  onClick={() => onPickLikert(opt.risk)}
                >
                  <span className="cp-quick__likert-ring" aria-hidden>
                    <svg className="cp-quick__likert-check" viewBox="0 0 12 12" width="17" height="17" aria-hidden>
                      <path
                        d="M2.5 6 L5 8.5 L9.5 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
            <span className="cp-quick__pole cp-quick__pole--agree">Agree</span>
          </div>
        </section>

        <div className="cp-quick__footer">
          {step > 0 ? (
            <button type="button" className="cp-quick__back" onClick={goBackLikert}>
              ← Back
            </button>
          ) : (
            <span />
          )}
          <Link to="/" className="cp-quick__exit">
            Exit
          </Link>
        </div>
      </div>
    </QuickCheckShell>
  );
}
