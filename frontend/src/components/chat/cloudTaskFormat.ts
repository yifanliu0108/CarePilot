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

function stripCodeFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
}

/** Pull the first `{ … }` block with brace depth, respecting JSON string escapes. */
function extractBalancedObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonLenient(text: string): unknown | null {
  const t = stripCodeFences(text);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    /* try first JSON object substring */
  }
  const slice = extractBalancedObject(t);
  if (slice) {
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
  return null;
}

function coerceGroceryRow(r: unknown): GroceryPriceRow | null {
  if (!r || typeof r !== "object") return null;
  const x = r as Record<string, unknown>;
  const store = x.store != null ? String(x.store).trim() : "";
  const product = x.product != null ? String(x.product).trim() : "";
  if (!store && !product) return null;
  const productUrl =
    typeof x.productUrl === "string" && x.productUrl.trim() ? x.productUrl.trim() : undefined;
  const searchUrl =
    typeof x.searchUrl === "string" && x.searchUrl.trim() ? x.searchUrl.trim() : undefined;
  return {
    store: store || "—",
    product: product || "—",
    price: x.price != null ? String(x.price) : "—",
    productUrl,
    searchUrl,
  };
}

function normalizeResultsArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.values(raw as Record<string, unknown>);
  }
  return [];
}

/** Agent sometimes returns a flat array: [{ query, store, product, price }, …] instead of { query, results: [...] }. */
function isFlatGroceryRow(o: unknown): o is Record<string, unknown> {
  if (!o || typeof o !== "object") return false;
  const x = o as Record<string, unknown>;
  if (typeof x.query !== "string" || !x.query.trim()) return false;
  if (x.results !== undefined) return false;
  return x.store != null || x.product != null || x.price != null || x.productUrl != null;
}

function groupFlatRowsToItems(rows: unknown[]): GroceryPriceItem[] | null {
  const byQuery = new Map<string, GroceryPriceRow[]>();
  for (const row of rows) {
    if (!isFlatGroceryRow(row)) continue;
    const q = String(row.query).trim();
    const r = coerceGroceryRow(row);
    if (!r) continue;
    if (!byQuery.has(q)) byQuery.set(q, []);
    byQuery.get(q)!.push(r);
  }
  if (byQuery.size === 0) return null;
  return Array.from(byQuery.entries()).map(([query, results]) => ({ query, results }));
}

function normalizeGroceryItems(items: unknown): GroceryPriceItem[] | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  if (isFlatGroceryRow(items[0])) {
    const grouped = groupFlatRowsToItems(items);
    return grouped?.length ? grouped : null;
  }
  const out: GroceryPriceItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const query =
      (typeof o.query === "string" && o.query.trim()) ||
      (typeof o.searchQuery === "string" && o.searchQuery.trim()) ||
      (typeof o.name === "string" && o.name.trim()) ||
      "";
    if (!query) continue;
    const rawResults = normalizeResultsArray(o.results ?? o.stores ?? o.matches);
    const results = rawResults
      .map(coerceGroceryRow)
      .filter((x): x is GroceryPriceRow => x != null);
    if (results.length === 0) {
      out.push({
        query,
        results: [
          {
            store: "—",
            product: "No store listing was captured for this search.",
            price: "—",
          },
        ],
      });
    } else {
      out.push({ query, results });
    }
  }
  return out.length > 0 ? out : null;
}

const NESTED_KEYS = [
  "data",
  "result",
  "output",
  "content",
  "response",
  "body",
  "text",
  "message",
] as const;

function extractGroceryItemsFromParsed(parsed: unknown): GroceryPriceItem[] | null {
  if (parsed == null) return null;
  if (typeof parsed === "string") {
    const inner = parseJsonLenient(parsed);
    return extractGroceryItemsFromParsed(inner);
  }
  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && isFlatGroceryRow(parsed[0])) {
      const flat = groupFlatRowsToItems(parsed);
      if (flat?.length) return flat;
    }
    return normalizeGroceryItems(parsed);
  }
  if (typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const maybeFlat = o.results ?? o.rows ?? o.findings;
  if (Array.isArray(maybeFlat) && maybeFlat.length > 0 && isFlatGroceryRow(maybeFlat[0])) {
    const flat = groupFlatRowsToItems(maybeFlat);
    if (flat?.length) return flat;
  }
  const itemsRaw = o.items ?? o.Items ?? o.grocery;
  let asArray: unknown[] | null = null;
  if (Array.isArray(itemsRaw)) asArray = itemsRaw;
  else if (typeof itemsRaw === "string") {
    const inner = parseJsonLenient(itemsRaw);
    if (Array.isArray(inner)) asArray = inner;
  }
  if (asArray) {
    const n = normalizeGroceryItems(asArray);
    if (n) return n;
  }
  for (const k of NESTED_KEYS) {
    const v = o[k];
    if (v === undefined) continue;
    if (typeof v === "string") {
      const inner = parseJsonLenient(v);
      const items = extractGroceryItemsFromParsed(inner);
      if (items) return items;
    } else {
      const items = extractGroceryItemsFromParsed(v);
      if (items) return items;
    }
  }
  return null;
}

function extractSubstitutions(parsed: unknown): string | undefined {
  if (parsed == null) return undefined;
  if (typeof parsed === "string") {
    const inner = parseJsonLenient(parsed);
    return extractSubstitutions(inner);
  }
  if (typeof parsed !== "object") return undefined;
  const o = parsed as Record<string, unknown>;
  const raw = o.substitutions ?? o.substitution ?? o.substitutionIdeas ?? o.alternatives;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    const lines = raw.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (lines.length) return lines.join("\n\n");
  }
  return undefined;
}

export type ParsedGroceryOutput = {
  items: GroceryPriceItem[];
  substitutionsNote?: string;
};

/**
 * Parse Browser Use / agent output into grocery rows + optional substitution copy.
 */
export function parseGroceryCloudOutput(output: unknown): ParsedGroceryOutput | null {
  if (output == null) return null;

  let parsed: unknown = output;
  if (typeof output === "string") {
    parsed = parseJsonLenient(output);
  }

  const substitutionsNote = extractSubstitutions(parsed);
  const items = extractGroceryItemsFromParsed(parsed);

  const hasItems = items != null && items.length > 0;
  const hasSubs = Boolean(substitutionsNote?.trim());
  if (!hasItems && !hasSubs) return null;

  return {
    items: items ?? [],
    ...(hasSubs ? { substitutionsNote } : {}),
  };
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
  if (grocery && (grocery.items.length > 0 || grocery.substitutionsNote)) {
    return {
      kind: "grocery",
      title: "Grocery search results",
      subtitle:
        "Public store listings—prices and stock can change. Use the buttons to open the product or search page.",
      grocery: grocery.items,
      grocerySubstitutions: grocery.substitutionsNote,
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
