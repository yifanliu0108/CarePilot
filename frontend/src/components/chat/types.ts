import type { BrowserSession } from "./journeyTypes";

export type ResourceLink = { label: string; url: string };

export type GroceryPriceRow = {
  store: string;
  product: string;
  price: string;
  productUrl?: string;
  /** Direct search-results URL so the user can re-run the search in one tap. */
  searchUrl?: string;
};

export type GroceryQueryResult = { query: string; results: GroceryPriceRow[] };

export type CarePlaceRow = {
  name: string;
  address?: string;
  mapsUrl?: string;
  rating?: string;
  note?: string;
  /** When from Google Maps nearby search (server-computed). */
  distanceMeters?: number;
};

/** Structured Browser Use follow-up shown in the center chat. */
export type BrowserRunPayload = {
  kind: "grocery" | "care" | "generic" | "maps";
  title: string;
  subtitle?: string;
  grocery?: GroceryQueryResult[];
  /** Natural-language substitution ideas from the browser agent (if present in JSON). */
  grocerySubstitutions?: string;
  carePlaces?: CarePlaceRow[];
  /** Google Maps API results (nearby grocery or care facilities). */
  mapsContext?: "grocery" | "care";
  mapsPlaces?: CarePlaceRow[];
  mapsDisclaimer?: string;
  rawText?: string;
};

export type RecommendationAction = {
  id: string;
  label: string;
  type: "task";
  /** Step order from Gemini browserSession.steps (for numbered checklist UI). */
  stepOrder?: number;
};

export type UserChatMessage = { id: string; role: "user"; text: string };

/** When set, chat card uses intro + list + ease-up instead of raw `text` layout. */
export type NutritionSections = {
  intro: string;
  easeUpOn: string | null;
  closing: string | null;
};

export type AssistantChatMessage = {
  id: string;
  role: "assistant";
  text: string;
  foodsToTry: string[];
  /** Curated links from the API (label + url). Section title comes from `titleForResourceLinks`. */
  resourceLinks: ResourceLink[];
  /** Filled when a Browser Use task completes—rendered with clear sections in the chat card. */
  browserRun?: BrowserRunPayload;
  /** Parsed from assistant text when it follows the nutrition template (brief + foods + ease-up). */
  nutritionSections?: NutritionSections | null;
};

export type ChatMessage = UserChatMessage | AssistantChatMessage;

export function assistantMessageFromApi(
  id: string,
  assistantText: string,
  browserSession: BrowserSession | null | undefined,
): AssistantChatMessage {
  const parsed = parseNutritionAssistantText(assistantText);
  const foodsToTry = parsed.isStructured ? parsed.foods : parseFoodBullets(assistantText);
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
    nutritionSections: parsed.isStructured
      ? {
          intro: parsed.intro,
          easeUpOn: parsed.easeUpOn,
          closing: parsed.closingNote,
        }
      : null,
  };
}

/** Assistant message for a completed Browser Use task (center chat). */
export function assistantMessageFromBrowserRun(id: string, run: BrowserRunPayload): AssistantChatMessage {
  const text = run.subtitle ? `${run.title}\n\n${run.subtitle}` : run.title;
  return {
    id,
    role: "assistant",
    text,
    foodsToTry: [],
    resourceLinks: [],
    nutritionSections: null,
    browserRun: run,
  };
}

/** Google Maps nearby results posted into the chat thread. */
export function assistantMessageFromMaps(
  id: string,
  run: BrowserRunPayload & { kind: "maps" },
): AssistantChatMessage {
  const text = run.subtitle ? `${run.title}\n\n${run.subtitle}` : run.title;
  return {
    id,
    role: "assistant",
    text,
    foodsToTry: [],
    resourceLinks: [],
    nutritionSections: null,
    browserRun: run,
  };
}

const FOODS_HEADING = /^foods to (emphasize|try):\s*$/i;
const EASE_UP_LINE = /^ease up on:\s*(.+)$/i;

/**
 * Nutrition replies: brief intro, optional "Foods to emphasize:" heading, `-` food lines,
 * optional "Ease up on: a, b" line, optional closing note. Falls back to isStructured: false
 * when none of that applies (care / generic replies).
 */
export function parseNutritionAssistantText(text: string): {
  intro: string;
  foods: string[];
  easeUpOn: string | null;
  closingNote: string | null;
  isStructured: boolean;
} {
  const trimmedLines = text.split("\n").map((l) => l.trim());
  let i = 0;
  const intro: string[] = [];

  while (i < trimmedLines.length) {
    const line = trimmedLines[i];
    if (!line) {
      i++;
      continue;
    }
    if (FOODS_HEADING.test(line)) {
      i++;
      break;
    }
    if (EASE_UP_LINE.test(line)) break;
    if (/^[-*•]\s+/.test(line)) break;
    intro.push(line);
    i++;
  }

  const foods: string[] = [];
  while (i < trimmedLines.length) {
    const line = trimmedLines[i];
    if (!line) {
      i++;
      if (foods.length > 0) break;
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      foods.push(bullet[1].trim());
      i++;
      continue;
    }
    if (FOODS_HEADING.test(line)) {
      i++;
      continue;
    }
    break;
  }

  let easeUpOn: string | null = null;
  const closing: string[] = [];
  while (i < trimmedLines.length) {
    const line = trimmedLines[i];
    if (!line) {
      i++;
      continue;
    }
    const ease = line.match(EASE_UP_LINE);
    if (ease) {
      easeUpOn = ease[1].trim();
      i++;
      continue;
    }
    closing.push(line);
    i++;
  }
  const closingNote = closing.join("\n").trim() || null;
  const introText = intro.join(" ").replace(/\s+/g, " ").trim();

  const hasStructure =
    foods.length > 0 ||
    easeUpOn != null ||
    trimmedLines.some((l) => FOODS_HEADING.test(l) || EASE_UP_LINE.test(l));

  if (!hasStructure) {
    return {
      intro: text.trim(),
      foods: [],
      easeUpOn: null,
      closingNote: null,
      isStructured: false,
    };
  }

  return {
    intro: introText,
    foods,
    easeUpOn,
    closingNote,
    isStructured: true,
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
