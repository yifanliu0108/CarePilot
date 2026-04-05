import { useState } from "react";
import { Link } from "react-router-dom";
import { BodyUnitToggles } from "../components/BodyUnitToggles";
import { useSession } from "../context/SessionContext";
import {
  formatHeightDisplay,
  formatWeightDisplay,
  loadBodyUnitPreferences,
  saveBodyUnitPreferences,
  type BodyUnitPreferences,
  type HeightDisplayUnit,
  type WeightDisplayUnit,
} from "../lib/bodyUnits";

function field(label: string, value: string | number | null) {
  const display =
    value === null || value === undefined || value === ""
      ? "—"
      : typeof value === "number"
        ? String(value)
        : value;
  return (
    <div className="cp-dl__row">
      <dt className="cp-dl__dt">{label}</dt>
      <dd className="cp-dl__dd">{display}</dd>
    </div>
  );
}

function ratingField(label: string, r: number | null | undefined) {
  const display =
    typeof r === "number" && r >= 1 && r <= 5 ? `${r} / 5` : "—";
  return (
    <div className="cp-dl__row">
      <dt className="cp-dl__dt">{label}</dt>
      <dd className="cp-dl__dd">{display}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { me } = useSession();
  const [units, setUnits] = useState<BodyUnitPreferences>(() => loadBodyUnitPreferences());

  if (!me) {
    return (
      <div className="cp-page">
        <div className="cp-page__inner">
          <p className="cp-page__sub">No profile loaded.</p>
        </div>
      </div>
    );
  }
  const p = me.profile;

  function updateUnits(next: BodyUnitPreferences) {
    saveBodyUnitPreferences(next);
    setUnits(next);
  }

  function onHeightChange(height: HeightDisplayUnit) {
    if (height === units.height) return;
    updateUnits({ ...units, height });
  }

  function onWeightChange(weight: WeightDisplayUnit) {
    if (weight === units.weight) return;
    updateUnits({ ...units, weight });
  }

  return (
    <div className="cp-page">
      <div className="cp-page__inner">
      <header className="cp-page__head">
        <h1 className="cp-page__title">Profile</h1>
        <p className="cp-page__sub">
          {me.username} · {me.email}
        </p>
        <Link to="/input" className="cp-btn cp-btn--secondary cp-page__edit">
          Edit information
        </Link>
      </header>

      <section className="cp-card">
        <div className="cp-card__title-row">
          <h2 className="cp-card__title">Basics</h2>
          <div className="cp-card__toggle-wrap">
            <span className="cp-form__unit-label" id="profile-body-units-label">
              Units
            </span>
            <BodyUnitToggles
              units={units}
              onHeightChange={onHeightChange}
              onWeightChange={onWeightChange}
              labelledBy="profile-body-units-label"
            />
          </div>
        </div>
        <dl className="cp-dl">
          {field("Age", p.age)}
          {field("Height", formatHeightDisplay(p.heightCm, units.height))}
          {field("Weight", formatWeightDisplay(p.weightKg, units.weight))}
          {field("BMI", p.bmi)}
        </dl>
      </section>

      <section className="cp-card">
        <div className="cp-card__title-row">
          <h2 className="cp-card__title">Subhealth focus (1–5)</h2>
          <Link to="/quick-check" className="cp-btn cp-btn--secondary cp-page__edit">
            Update via quick check
          </Link>
        </div>
        <p className="cp-card__caption">
          1 = minimal · 5 = strong focus. Re-run the quick check anytime to refresh these scores; body metrics stay
          under Health input.
        </p>
        <dl className="cp-dl">
          {ratingField("Sleep & recovery", p.sleepRating)}
          {ratingField("Cognitive & focus", p.cognitiveRating)}
          {ratingField("Digestive", p.digestiveRating)}
          {ratingField("Musculoskeletal", p.musculoskeletalRating)}
          {ratingField("Immune", p.immuneRating)}
        </dl>
      </section>
      </div>
    </div>
  );
}
