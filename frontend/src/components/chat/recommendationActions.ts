import type { BrowserSession } from "./journeyTypes";
import type { RecommendationAction } from "./types";
import { parseFoodBullets } from "./types";

export function buildRecommendationActions(
  assistantText: string,
  live: BrowserSession | null,
  cloudConfigured: boolean,
): RecommendationAction[] {
  const actions: RecommendationAction[] = [];
  if (live?.steps?.length) {
    for (const s of live.steps) {
      actions.push({
        id: `step-${live.id}-${s.order}`,
        label: s.description,
        type: "task",
      });
    }
  } else {
    const foodsToTry = parseFoodBullets(assistantText);
    foodsToTry.forEach((label, i) => {
      actions.push({ id: `task-${i}-${label.slice(0, 12)}`, label, type: "task" });
    });
  }
  const items = live?.priceCheckItems?.filter((x) => typeof x === "string" && x.trim()) ?? [];
  if (cloudConfigured && live && items.length > 0) {
    actions.push({
      id: "browseruse-grocery",
      label: "Check grocery prices (Walmart, Vons, Ralphs)",
      type: "task",
    });
  }
  return actions;
}
