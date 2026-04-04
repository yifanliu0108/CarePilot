import type { BodyUnitMode } from "../lib/bodyUnits";

type Props = {
  mode: BodyUnitMode;
  onChange: (mode: BodyUnitMode) => void;
  labelledBy?: string;
};

export function BodyUnitToggleBar({ mode, onChange, labelledBy }: Props) {
  return (
    <div
      className="cp-unit-toggle"
      role="group"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : "Height and weight units"}
    >
      <button
        type="button"
        className={"cp-unit-toggle__btn" + (mode === "metric" ? " cp-unit-toggle__btn--active" : "")}
        aria-pressed={mode === "metric"}
        onClick={() => onChange("metric")}
      >
        Metric
      </button>
      <button
        type="button"
        className={"cp-unit-toggle__btn" + (mode === "imperial" ? " cp-unit-toggle__btn--active" : "")}
        aria-pressed={mode === "imperial"}
        onClick={() => onChange("imperial")}
      >
        Imperial
      </button>
    </div>
  );
}
