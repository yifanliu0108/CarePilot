import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/session";
import { BodyUnitToggles } from "../components/BodyUnitToggles";
import { useSession } from "../context/SessionContext";
import {
  cmFromFtIn,
  ftInFromCm,
  kgFromLb,
  lbFromKg,
  loadBodyUnitPreferences,
  saveBodyUnitPreferences,
  type BodyUnitPreferences,
  type HeightDisplayUnit,
  type WeightDisplayUnit,
} from "../lib/bodyUnits";

const DEFAULT_RATING = 3;

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="cp-rating">
      <span className="cp-rating__label">{label}</span>
      <div className="cp-rating__scale" role="group" aria-label={`${label} 1 to 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={"cp-rating__btn" + (value === n ? " cp-rating__btn--active" : "")}
            aria-pressed={value === n}
            aria-label={`${n} out of 5`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function InputPage() {
  const { me, refreshMe } = useSession();
  const navigate = useNavigate();
  const p = me?.profile;

  const [units, setUnits] = useState<BodyUnitPreferences>(() => loadBodyUnitPreferences());

  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [ft, setFt] = useState("5");
  const [inch, setInch] = useState("8");
  const [sleepRating, setSleepRating] = useState(DEFAULT_RATING);
  const [cognitiveRating, setCognitiveRating] = useState(DEFAULT_RATING);
  const [digestiveRating, setDigestiveRating] = useState(DEFAULT_RATING);
  const [musculoskeletalRating, setMusculoskeletalRating] = useState(DEFAULT_RATING);
  const [immuneRating, setImmuneRating] = useState(DEFAULT_RATING);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!p) return;
    if (p.age != null) setAge(String(p.age));
    if (p.heightCm != null) {
      setHeightCm(String(p.heightCm));
      const { ft: f, inch: i } = ftInFromCm(p.heightCm);
      setFt(String(f));
      setInch(String(i));
    }
    const prefs = loadBodyUnitPreferences();
    if (p.weightKg != null) {
      setWeightInput(
        prefs.weight === "kg"
          ? String(p.weightKg)
          : String(lbFromKg(p.weightKg)),
      );
    }
    setSleepRating(p.sleepRating ?? DEFAULT_RATING);
    setCognitiveRating(p.cognitiveRating ?? DEFAULT_RATING);
    setDigestiveRating(p.digestiveRating ?? DEFAULT_RATING);
    setMusculoskeletalRating(p.musculoskeletalRating ?? DEFAULT_RATING);
    setImmuneRating(p.immuneRating ?? DEFAULT_RATING);
  }, [p]);

  function onHeightUnitChange(next: HeightDisplayUnit) {
    if (next === units.height) return;
    if (next === "ft_in" && units.height === "cm") {
      const h = parseFloat(heightCm);
      if (Number.isFinite(h) && h > 0) {
        const { ft: f, inch: i } = ftInFromCm(h);
        setFt(String(f));
        setInch(String(i));
      }
    } else if (next === "cm" && units.height === "ft_in") {
      const f = parseFloat(ft);
      const i = parseFloat(inch);
      if (Number.isFinite(f) && Number.isFinite(i)) {
        const cm = cmFromFtIn(f, i);
        if (Number.isFinite(cm) && cm > 0) setHeightCm(String(cm));
      }
    }
    const u = { ...units, height: next };
    saveBodyUnitPreferences(u);
    setUnits(u);
  }

  function onWeightUnitChange(next: WeightDisplayUnit) {
    if (next === units.weight) return;
    const w = parseFloat(weightInput);
    if (Number.isFinite(w) && w > 0) {
      if (next === "lb" && units.weight === "kg") {
        setWeightInput(String(lbFromKg(w)));
      } else if (next === "kg" && units.weight === "lb") {
        setWeightInput(String(Math.round(kgFromLb(w) * 10) / 10));
      }
    }
    const u = { ...units, weight: next };
    saveBodyUnitPreferences(u);
    setUnits(u);
  }

  function getHeightCm(): number | null {
    if (units.height === "cm") {
      const h = parseFloat(heightCm);
      return Number.isFinite(h) && h > 0 ? h : null;
    }
    const f = parseFloat(ft);
    const i = parseFloat(inch);
    if (!Number.isFinite(f) || !Number.isFinite(i)) return null;
    const cm = cmFromFtIn(f, i);
    return Number.isFinite(cm) && cm > 0 ? cm : null;
  }

  function getWeightKg(): number | null {
    const w = parseFloat(weightInput);
    if (!Number.isFinite(w) || w <= 0) return null;
    const kg = units.weight === "kg" ? w : kgFromLb(w);
    return Math.round(kg * 100) / 100;
  }

  function computedBmi(): number | null {
    const h = getHeightCm();
    const w = getWeightKg();
    if (h == null || w == null) return null;
    const m = h / 100;
    return Math.round((w / (m * m)) * 10) / 10;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const h = getHeightCm();
      const w = getWeightKg();
      const a = parseInt(age, 10);
      const bmi =
        h != null && w != null ? Math.round((w / (h / 100) ** 2) * 10) / 10 : null;
      const body = {
        age: Number.isFinite(a) ? a : null,
        heightCm: h,
        weightKg: w,
        bmi,
        sleepRating,
        cognitiveRating,
        digestiveRating,
        musculoskeletalRating,
        immuneRating,
        symptomTagIds: p?.symptomTagIds ?? [],
        completedOnboarding: true,
      };
      const r = await apiFetch("/api/me/profile", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Could not save profile");
      await refreshMe();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const bmiPreview = computedBmi();
  const heightCmMode = units.height === "cm";
  const weightKgMode = units.weight === "kg";

  return (
    <div className="cp-page cp-page--input">
      <div className="cp-page__inner">
        <header className="cp-page__head">
          <h1 className="cp-page__title">Your health snapshot</h1>
          <p className="cp-page__sub">
            Basic metrics and subhealth focus (1–5) help tailor food ideas and your daily meal plan.
          </p>
        </header>

        <form className="cp-form cp-form--wide" onSubmit={(e) => void onSubmit(e)}>
        <fieldset className="cp-form__fieldset" aria-labelledby="input-section-body">
          <h2 className="cp-form__section-title" id="input-section-body">
            Body metrics
          </h2>
          <div className="cp-form__unit-row">
            <span className="cp-form__unit-label" id="input-body-units-label">
              Units
            </span>
            <BodyUnitToggles
              units={units}
              onHeightChange={onHeightUnitChange}
              onWeightChange={onWeightUnitChange}
              labelledBy="input-body-units-label"
            />
          </div>
          {heightCmMode ? (
            <div className="cp-form__row cp-form__row--metrics-3">
              <label className="cp-form__label">
                Age
                <input
                  className="cp-form__input"
                  type="number"
                  min={1}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 34"
                />
              </label>
              <label className="cp-form__label">
                {weightKgMode ? "Weight (kg)" : "Weight (lb)"}
                <input
                  className="cp-form__input"
                  type="number"
                  step="0.1"
                  min={weightKgMode ? 1 : 2}
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder={weightKgMode ? "e.g. 72" : "e.g. 160"}
                />
              </label>
              <label className="cp-form__label">
                Height (cm)
                <input
                  className="cp-form__input"
                  type="number"
                  step="0.1"
                  min={50}
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="e.g. 172"
                />
              </label>
            </div>
          ) : (
            <>
              <div className="cp-form__row">
                <label className="cp-form__label">
                  Age
                  <input
                    className="cp-form__input"
                    type="number"
                    min={1}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="e.g. 34"
                  />
                </label>
                <label className="cp-form__label">
                  {weightKgMode ? "Weight (kg)" : "Weight (lb)"}
                  <input
                    className="cp-form__input"
                    type="number"
                    step="0.1"
                    min={weightKgMode ? 1 : 2}
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    placeholder={weightKgMode ? "e.g. 72" : "e.g. 160"}
                  />
                </label>
              </div>
              <div className="cp-form__row">
                <label className="cp-form__label">
                  Height (ft)
                  <input
                    className="cp-form__input"
                    type="number"
                    step="1"
                    min={3}
                    max={8}
                    value={ft}
                    onChange={(e) => setFt(e.target.value)}
                  />
                </label>
                <label className="cp-form__label">
                  Height (in)
                  <input
                    className="cp-form__input"
                    type="number"
                    step="0.1"
                    min={0}
                    max={11.99}
                    value={inch}
                    onChange={(e) => setInch(e.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          <p className="cp-form__hint cp-form__bmi-preview">
            BMI (preview):{" "}
            <strong>{bmiPreview != null ? bmiPreview : "—"}</strong>
            {bmiPreview != null ? " (also sent to the server from height & weight)" : ""}
          </p>
        </fieldset>

        <fieldset className="cp-form__fieldset" aria-labelledby="input-section-subhealth">
          <h2 className="cp-form__section-title" id="input-section-subhealth">
            Subhealth focus
          </h2>
          <p className="cp-rating__lede">
            Rate each area from <strong>1</strong> (minimal) to <strong>5</strong> (strong focus or
            bother). Meal plans treat <strong>3+</strong> as an active concern.
          </p>
          <div className="cp-rating__list">
            <RatingRow label="Sleep & recovery" value={sleepRating} onChange={setSleepRating} />
            <RatingRow label="Cognitive & focus" value={cognitiveRating} onChange={setCognitiveRating} />
            <RatingRow label="Digestive" value={digestiveRating} onChange={setDigestiveRating} />
            <RatingRow
              label="Musculoskeletal"
              value={musculoskeletalRating}
              onChange={setMusculoskeletalRating}
            />
            <RatingRow label="Immune" value={immuneRating} onChange={setImmuneRating} />
          </div>
        </fieldset>

        {error ? (
          <p className="cp-form__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="cp-form__actions">
          <Link to="/" className="cp-btn cp-btn--secondary">
            Cancel
          </Link>
          <button type="submit" className="cp-btn cp-btn--primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
