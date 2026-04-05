import type { RiskRow } from "./quickCheck";

const STORAGE_KEY = "carepilot.quickCheckSnapshot.v1";

export type QuickCheckLocalSnapshot = {
  riskRow: RiskRow;
  symptomTagIds: string[];
  digestiveRating: number;
};

function isRiskRow(o: unknown): o is RiskRow {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  const keys = ["sleep", "energy", "stress", "focus", "pain"] as const;
  for (const k of keys) {
    const n = r[k];
    const x = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
    if (!Number.isFinite(x) || x < 1 || x > 5) return false;
  }
  return true;
}

/** Persist last quick-check outcome on this device (guests / before sign-in). */
export function persistQuickCheckLocalSnapshot(s: QuickCheckLocalSnapshot): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

export function readQuickCheckLocalSnapshot(): QuickCheckLocalSnapshot | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (!isRiskRow(o.riskRow)) return null;
    const tags = o.symptomTagIds;
    const symptomTagIds = Array.isArray(tags)
      ? tags.map((x) => String(x).trim()).filter(Boolean).slice(0, 48)
      : [];
    const d = o.digestiveRating;
    const digestive =
      typeof d === "number" && Number.isFinite(d)
        ? Math.min(5, Math.max(1, Math.round(d)))
        : 3;
    return {
      riskRow: o.riskRow as RiskRow,
      symptomTagIds,
      digestiveRating: digestive,
    };
  } catch {
    return null;
  }
}

export function clearQuickCheckLocalSnapshot(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* */
  }
}

/** Map stored quick-check row + digestive into the same 1–5 fields as Health input. */
export function profileRatingsFromLocalSnapshot(s: QuickCheckLocalSnapshot): {
  sleepRating: number;
  cognitiveRating: number;
  digestiveRating: number;
  musculoskeletalRating: number;
  immuneRating: number;
  symptomTagIds: string[];
} {
  const { riskRow: row, digestiveRating, symptomTagIds } = s;
  const ms = Math.max(row.energy, row.pain);
  return {
    sleepRating: row.sleep,
    cognitiveRating: row.focus,
    digestiveRating,
    musculoskeletalRating: ms,
    immuneRating: row.stress,
    symptomTagIds,
  };
}
