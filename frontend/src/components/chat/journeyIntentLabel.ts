/** Human-readable label for Gemini journey `intent` (nutrition / care / meta). */
export function formatJourneyIntent(raw: string | null | undefined): string {
  if (raw == null || !String(raw).trim()) return "General";
  const s = String(raw).trim();
  const map: Record<string, string> = {
    sleep: "Sleep & recovery",
    cognitive: "Cognitive & focus",
    digestive: "Digestive",
    musculoskeletal: "Musculoskeletal",
    immune: "Immune",
    general: "General",
    meta: "Meta",
    care_search: "Care search",
    scheduling: "Scheduling",
    insurance: "Insurance",
    pharmacy: "Pharmacy",
  };
  const noPrefix = s.replace(/^nutrition_/, "").replace(/^care_/i, "");
  if (map[noPrefix]) return map[noPrefix];
  if (map[s]) return map[s];
  return noPrefix
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
