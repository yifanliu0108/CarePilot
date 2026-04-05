/**
 * Google Maps Platform — Places (Legacy) + Geocoding via REST.
 * Set GOOGLE_MAPS_API_KEY in backend/.env (server-side only; restrict key to Places + Geocoding).
 * @see https://developers.google.com/maps/documentation/places/web-service/search
 */

const BASE = "https://maps.googleapis.com/maps/api";

export function placesConfigured() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

function apiKey() {
  const k = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!k) {
    const err = new Error(
      "GOOGLE_MAPS_API_KEY is not set — add it to backend/.env (Places API + Geocoding API enabled).",
    );
    err.statusCode = 503;
    throw err;
  }
  return k;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @param {Record<string, unknown>} p
 * @param {number} userLat
 * @param {number} userLng
 */
function normalizePlace(p, userLat, userLng) {
  const geom = p.geometry && typeof p.geometry === "object" ? p.geometry : null;
  const loc = geom?.location && typeof geom.location === "object" ? geom.location : null;
  const lat = typeof loc?.lat === "number" ? loc.lat : Number(loc?.lat);
  const lng = typeof loc?.lng === "number" ? loc.lng : Number(loc?.lng);
  let distanceMeters;
  if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(userLat) && Number.isFinite(userLng)) {
    distanceMeters = Math.round(haversineMeters(userLat, userLng, lat, lng));
  }
  const placeId = String(p.place_id ?? "");
  const name = String(p.name ?? "Place");
  const address = String(
    (typeof p.vicinity === "string" && p.vicinity) ||
      (typeof p.formatted_address === "string" && p.formatted_address) ||
      "",
  );
  const mapsUrl = placeId
    ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " " + address)}`;

  return {
    placeId,
    name,
    address,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    mapsUrl,
    rating: typeof p.rating === "number" ? p.rating : undefined,
    userRatingsTotal:
      typeof p.user_ratings_total === "number" ? p.user_ratings_total : undefined,
    openNow:
      p.opening_hours &&
      typeof p.opening_hours === "object" &&
      typeof p.opening_hours.open_now === "boolean"
        ? p.opening_hours.open_now
        : null,
    distanceMeters,
  };
}

async function fetchPlacesJson(path, params) {
  const key = apiKey();
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  url.searchParams.set("key", key);
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  const status = data.status;
  if (status !== "OK" && status !== "ZERO_RESULTS") {
    const msg = data.error_message || status || "Places request failed";
    const err = new Error(msg);
    err.statusCode = 502;
    throw err;
  }
  return data;
}

/**
 * @param {string} address
 * @returns {Promise<{ lat: number, lng: number, formattedAddress: string }>}
 */
export async function geocodeAddress(address) {
  const data = await fetchPlacesJson("/geocode/json", { address });
  const loc = data.results?.[0]?.geometry?.location;
  if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
    const err = new Error("No results for that address.");
    err.statusCode = 404;
    throw err;
  }
  return {
    lat: loc.lat,
    lng: loc.lng,
    formattedAddress: String(data.results[0].formatted_address ?? address),
  };
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {{ radiusMeters?: number }} [opts]
 */
export async function nearbyGrocery(lat, lng, opts = {}) {
  const radius = Math.min(Math.max(Number(opts.radiusMeters) || 8000, 1500), 50000);
  const key = apiKey();
  const types = ["supermarket", "grocery_store"];
  const seen = new Set();
  /** @type {Record<string, unknown>[]} */
  const merged = [];

  for (const type of types) {
    const url = new URL(`${BASE}/place/nearbysearch/json`);
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("radius", String(radius));
    url.searchParams.set("type", type);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({}));
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      const msg = data.error_message || data.status || "Nearby search failed";
      const err = new Error(msg);
      err.statusCode = 502;
      throw err;
    }
    for (const r of data.results ?? []) {
      const id = r.place_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(r);
    }
  }

  const normalized = merged.map((p) => normalizePlace(p, lat, lng));
  normalized.sort(
    (a, b) =>
      (a.distanceMeters ?? Number.POSITIVE_INFINITY) -
      (b.distanceMeters ?? Number.POSITIVE_INFINITY),
  );
  return { places: normalized.slice(0, 12) };
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {'emergency' | 'urgent' | 'hospital'} [intent]
 */
export async function searchCareFacilities(lat, lng, intent = "emergency") {
  const queries = {
    emergency: "emergency room",
    urgent: "urgent care",
    hospital: "hospital",
  };
  const q = queries[intent] || queries.emergency;
  const data = await fetchPlacesJson("/place/textsearch/json", {
    query: q,
    location: `${lat},${lng}`,
    radius: 20000,
  });
  const results = data.results ?? [];
  const normalized = results.map((p) => normalizePlace(p, lat, lng));
  normalized.sort(
    (a, b) =>
      (a.distanceMeters ?? Number.POSITIVE_INFINITY) -
      (b.distanceMeters ?? Number.POSITIVE_INFINITY),
  );
  const noteByIntent =
    intent === "emergency"
      ? "Not a substitute for 911. For life-threatening emergencies, call emergency services."
      : intent === "urgent"
        ? "Verify hours and services by phone before visiting."
        : "For serious or emergent symptoms, seek appropriate in-person care or call emergency services.";

  return { places: normalized.slice(0, 10), disclaimer: noteByIntent, intent };
}
