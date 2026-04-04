import { useState } from "react";
import { Link } from "react-router-dom";
import { BodyUnitToggleBar } from "../components/BodyUnitToggleBar";
import { useSession } from "../context/SessionContext";
import {
  formatHeightDisplay,
  formatWeightDisplay,
  loadBodyUnitMode,
  saveBodyUnitMode,
  type BodyUnitMode,
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
  const [unitMode, setUnitMode] = useState<BodyUnitMode>(() => loadBodyUnitMode());

  if (!me) {
    return (
      <div className="cp-page">
        <p className="cp-page__sub">No profile loaded.</p>
      </div>
    );
  }
  const p = me.profile;

  function onUnitChange(mode: BodyUnitMode) {
    saveBodyUnitMode(mode);
    setUnitMode(mode);
  }

  return (
    <div className="cp-page">
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
            <BodyUnitToggleBar
              mode={unitMode}
              onChange={onUnitChange}
              labelledBy="profile-body-units-label"
            />
          </div>
        </div>
        <dl className="cp-dl">
          {field("Age", p.age)}
          {field("Height", formatHeightDisplay(p.heightCm, unitMode))}
          {field("Weight", formatWeightDisplay(p.weightKg, unitMode))}
          {field("BMI", p.bmi)}
        </dl>
      </section>

      <section className="cp-card">
        <h2 className="cp-card__title">Subhealth focus (1–5)</h2>
        <p className="cp-card__caption">1 = minimal · 5 = strong focus</p>
        <dl className="cp-dl">
          {ratingField("Sleep & recovery", p.sleepRating)}
          {ratingField("Cognitive & focus", p.cognitiveRating)}
          {ratingField("Digestive", p.digestiveRating)}
          {ratingField("Musculoskeletal", p.musculoskeletalRating)}
          {ratingField("Immune", p.immuneRating)}
        </dl>
      </section>
    </div>
  );
}
