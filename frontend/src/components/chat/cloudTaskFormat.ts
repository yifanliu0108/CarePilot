import { cloudStatusStillRunning } from "./cloudStatus";
import type { BrowserRunPayload } from "./types";

type GroceryPriceRow = {
  store: string;
  product: string;
  price: string;
  productUrl?: string;
  searchUrl?: string;
};
type GroceryPriceItem = { query: string; results: GroceryPriceRow[] };

/** Exported for sidebar preview + chat formatting. */
export function parseGroceryCloudOutput(output: unknown): { items: GroceryPriceItem[] } | null {
  if (output == null) return null;
  if (typeof output === "object" && output !== null) {
    const o = output as { items?: unknown };
    if (Array.isArray(o.items) && o.items.length > 0) {
      return { items: o.items as GroceryPriceItem[] };
    }
  }
  if (typeof output !== "string") return null;
  const raw = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  try {
    const j = JSON.parse(raw) as { items?: GroceryPriceItem[] };
    if (j && Array.isArray(j.items) && j.items.length > 0) return { items: j.items };
  } catch {
    /* ignore */
  }
  return null;
}

type CarePlace = { name: string; address?: string; mapsUrl?: string; rating?: string; note?: string };

function parseCareCloudOutput(output: unknown): { places: CarePlace[] } | null {
  if (output == null) return null;
  let obj: unknown = output;
  if (typeof output === "string") {
    const raw = output
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/m, "")
      .trim();
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null) return null;
  const places = (obj as { places?: unknown }).places;
  if (!Array.isArray(places) || places.length === 0) return null;
  const cleaned: CarePlace[] = [];
  for (const p of places) {
    if (p && typeof p === "object" && typeof (p as { name?: string }).name === "string") {
      const x = p as CarePlace;
      cleaned.push({
        name: x.name,
        address: typeof x.address === "string" ? x.address : undefined,
        mapsUrl: typeof x.mapsUrl === "string" ? x.mapsUrl : undefined,
        rating: typeof x.rating === "string" ? x.rating : undefined,
        note: typeof x.note === "string" ? x.note : undefined,
      });
    }
  }
  return cleaned.length ? { places: cleaned } : null;
}

/**
 * Build a structured chat payload from Browser Use task output (after terminal status).
 */
export function browserRunPayloadFromOutput(
  output: unknown,
  status: string,
): BrowserRunPayload | null {
  if (cloudStatusStillRunning(status)) return null;

  if (output == null) {
    return {
      kind: "generic",
      title: "Browser task completed",
      subtitle: `Status: ${status}`,
      rawText: "(No output body returned.)",
    };
  }

  const grocery = parseGroceryCloudOutput(output);
  if (grocery) {
    return {
      kind: "grocery",
      title: "Grocery search results",
      subtitle:
        "Prices are from public pages and may change. Many sites require login to add to cart—use the links to open the store and search or product page.",
      grocery: grocery.items,
    };
  }

  const care = parseCareCloudOutput(output);
  if (care) {
    return {
      kind: "care",
      title: "Places to consider",
      subtitle:
        "For emergencies call 911 (US). These are starting points from the web—not a substitute for professional advice.",
      carePlaces: care.places,
    };
  }

  const text =
    typeof output === "string" ? output.trim() : JSON.stringify(output, null, 2);
  if (!text) return null;
  return {
    kind: "generic",
    title: "Browser task result",
    rawText: text.length > 12000 ? `${text.slice(0, 12000)}…` : text,
  };
}
