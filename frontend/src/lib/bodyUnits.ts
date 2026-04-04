export const BODY_UNITS_STORAGE_KEY = "carepilot-body-units";

export type BodyUnitMode = "metric" | "imperial";

const KG_PER_LB = 0.45359237;

export function loadBodyUnitMode(): BodyUnitMode {
  try {
    const v = localStorage.getItem(BODY_UNITS_STORAGE_KEY);
    if (v === "imperial" || v === "metric") return v;
  } catch {
    /* ignore */
  }
  return "metric";
}

export function saveBodyUnitMode(mode: BodyUnitMode) {
  try {
    localStorage.setItem(BODY_UNITS_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Pounds → kilograms (full precision for BMI / API). */
export function kgFromLb(lb: number) {
  return lb * KG_PER_LB;
}

/** Kilograms → pounds for display. */
export function lbFromKg(kg: number) {
  return Math.round((kg / KG_PER_LB) * 10) / 10;
}

export function cmFromFtIn(ft: number, inch: number) {
  const totalIn = ft * 12 + inch;
  if (!Number.isFinite(totalIn) || totalIn <= 0) return NaN;
  return Math.round(totalIn * 2.54 * 10) / 10;
}

export function ftInFromCm(cm: number): { ft: number; inch: number } {
  if (!Number.isFinite(cm) || cm <= 0) return { ft: 0, inch: 0 };
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  let inch = totalIn - ft * 12;
  inch = Math.round(inch * 10) / 10;
  if (inch >= 12) {
    return { ft: ft + 1, inch: 0 };
  }
  return { ft, inch };
}

export function formatHeightDisplay(cm: number | null, mode: BodyUnitMode): string {
  if (cm == null) return "—";
  if (mode === "metric") return `${cm} cm`;
  const { ft, inch } = ftInFromCm(cm);
  return `${ft} ft ${inch} in`;
}

export function formatWeightDisplay(kg: number | null, mode: BodyUnitMode): string {
  if (kg == null) return "—";
  if (mode === "metric") return `${kg} kg`;
  return `${lbFromKg(kg)} lb`;
}
