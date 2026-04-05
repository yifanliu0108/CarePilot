import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { HeroBackdrop } from "../components/HeroBackdrop";
import { apiFetch } from "../api/session";
import type { HealthProfile } from "../context/SessionContext";
import { useSession } from "../context/useSession";
import {
  buildPatternResult,
  detectPattern,
  LIKERT_OPTIONS,
  overallRisk,
  QUICK_QUESTIONS,
  risksFromAnswers,
  type PatternResult,
  type RiskRow,
} from "../lib/quickCheck";
import { formatSymptomSummary, SYMPTOM_WIZARD_PAGES } from "../lib/symptomTags";

function QuickCheckShell({ children, scroll }: { children: ReactNode; scroll?: boolean }) {
  return (
    <div
      id="cp-quick-check-page"
      className={"cp-page cp-page--quick" + (scroll ? " cp-page--quick--scroll" : "")}
    >
      <HeroBackdrop />
      <header className="cp-quick__nav" aria-label="Site">
        <Link to="/" className="cp-quick__nav-brand">
          CarePilot
        </Link>
      </header>
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
  const { me, refreshMe } = useSession();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [phase, setPhase] = useState<"likert" | "symptoms" | "result">("likert");
  const [symptomStep, setSymptomStep] = useState(0);
  const [selectedSymptomIds, setSelectedSymptomIds] = useState<string[]>([]);
  const [savedSymptomIds, setSavedSymptomIds] = useState<string[]>([]);
  const [result, setResult] = useState<PatternResult | null>(null);
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
      const id = detectPattern(risks);
      const pr = buildPatternResult(id);
      const ov = overallRisk(risks);
      setResult(pr);
      setScore(Math.round(ov * 10) / 10);
      setSavedSymptomIds(symptomTagIds);
      setPhase("result");
      setSaveError(null);
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
    [me?.profile, refreshMe],
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

  function restart() {
    setStep(0);
    setAnswers([]);
    setPhase("likert");
    setSymptomStep(0);
    setSelectedSymptomIds([]);
    setSavedSymptomIds([]);
    setResult(null);
    setScore(null);
    setSaveError(null);
    setSelectedRisk(null);
  }

  if (phase === "result" && result) {
    return (
      <QuickCheckShell scroll>
        <div className="cp-page__inner cp-quick cp-quick--result">
          <header className="cp-quick__result-head">
            <p className="cp-quick__eyebrow">Your pattern</p>
            <h1 className="cp-quick__state">{result.title}</h1>
            <p className="cp-quick__why">
              <span className="cp-quick__why-label">Why</span> {result.why}
            </p>
            <div className="cp-quick__action-card">
              <p className="cp-quick__action-label">Your next step</p>
              <p className="cp-quick__action">{result.action}</p>
            </div>
            {score != null ? (
              <p className="cp-quick__meta">
                Signal strength: <strong>{score}</strong> / 5 · Not a diagnosis — a snapshot for your habits.
              </p>
            ) : null}
            {savedSymptomIds.length > 0 ? (
              <p className="cp-quick__symptom-recap" role="status">
                Early signals you flagged: {formatSymptomSummary(savedSymptomIds)}. Mention persistent ones to a clinician.
              </p>
            ) : (
              <p className="cp-quick__symptom-recap cp-quick__symptom-recap--none" role="status">
                No extra symptom tags selected — you can always add details in chat or your full snapshot.
              </p>
            )}
            {saving ? <p className="cp-quick__saving">Saving your snapshot…</p> : null}
            {saveError ? (
              <p className="cp-form__error" role="alert">
                {saveError}
              </p>
            ) : null}
          </header>

          <section className="cp-quick__detail" aria-labelledby="quick-detail-h">
            <h2 id="quick-detail-h" className="cp-quick__detail-title">
              What this means
            </h2>
            <p className="cp-quick__summary">{result.summary}</p>
            <ul className="cp-quick__bullets">
              {result.whatThisMeans.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <h3 className="cp-quick__subhead">Suggestions</h3>
            <ul className="cp-quick__bullets">
              {result.suggestions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <nav className="cp-quick__support" aria-label="Next steps">
            <Link to="/plan" className="cp-btn cp-btn--primary">
              Weekly meal plan
            </Link>
            <Link to="/chat" className="cp-btn cp-btn--secondary">
              Ask in chat
            </Link>
            <Link to="/input" className="cp-quick__link-secondary">
              Full health snapshot (body metrics)
            </Link>
            <button type="button" className="cp-quick__link-btn" onClick={restart}>
              Retake quick check
            </button>
          </nav>
        </div>
      </QuickCheckShell>
    );
  }

  if (phase === "symptoms") {
    const page = SYMPTOM_WIZARD_PAGES[symptomStep];
    return (
      <QuickCheckShell scroll>
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
            <p className="cp-quick__symptom-trust">Optional · not medical advice</p>
          </header>

          <div className="cp-quick__symptom-main">
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
    <QuickCheckShell>
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
            <span className="cp-quick__pole cp-quick__pole--agree">Agree</span>
            <div className="cp-quick__scale">
              {LIKERT_OPTIONS.map((opt, i) => (
                <button
                  key={opt.risk}
                  type="button"
                  className={
                    "cp-quick__likert-btn cp-quick__likert-btn--s" +
                    i +
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
            <span className="cp-quick__pole cp-quick__pole--disagree">Disagree</span>
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
