import type { BrowserSession } from "./journeyTypes";

export type ResourceLink = { label: string; url: string };

export type RecommendationAction = {
  id: string;
  label: string;
  type: "task";
};

export type UserChatMessage = { id: string; role: "user"; text: string };

export type AssistantChatMessage = {
  id: string;
  role: "assistant";
  text: string;
  foodsToTry: string[];
  /** Curated links from the API (label + url). Section title comes from `titleForResourceLinks`. */
  resourceLinks: ResourceLink[];
};

export type ChatMessage = UserChatMessage | AssistantChatMessage;

export function assistantMessageFromApi(
  id: string,
  assistantText: string,
  browserSession: BrowserSession | null | undefined,
): AssistantChatMessage {
  const foodsToTry = parseFoodBullets(assistantText);
  const resourceLinks: ResourceLink[] =
    browserSession?.actions
      ?.filter((a) => typeof a.url === "string" && a.url.trim())
      .map((a) => ({ label: a.label, url: a.url.trim() })) ?? [];
  return {
    id,
    role: "assistant",
    text: assistantText,
    foodsToTry,
    resourceLinks,
  };
}

/** Bullet list at start of assistant message → “Foods to try”. */
export function parseFoodBullets(text: string) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const foodsToTry: string[] = [];
  let seenBullet = false;
  for (const line of lines) {
    const m = line.match(/^[-*•]\s+(.+)$/);
    if (m) {
      seenBullet = true;
      foodsToTry.push(m[1].trim());
    } else if (seenBullet) {
      break;
    }
  }
  return foodsToTry;
}
