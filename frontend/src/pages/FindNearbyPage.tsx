import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "../api/session";
import { SmartButton } from "../components/chat/SmartButton";
import { MessageCard } from "../components/chat/MessageCard";
import { assistantMessageFromMaps } from "../components/chat/types";
import type { AssistantChatMessage } from "../components/chat/types";
import { persistNearbyGroceryStoreNames } from "../maps/nearbyStoreHintsStorage";

const TOP_NEARBY = 3;

type CareIntent = "emergency" | "urgent" | "hospital";
type NearbyCategory = "grocery" | "care";

type PlaceHit = {
  name: string;
  address: string;
  mapsUrl: string;
  rating?: number;
  distanceMeters?: number | null;
};

function topClosestPlaces(places: PlaceHit[], n: number): PlaceHit[] {
  const sorted = [...places].sort(
    (a, b) =>
      (a.distanceMeters ?? Number.POSITIVE_INFINITY) -
      (b.distanceMeters ?? Number.POSITIVE_INFINITY),
  );
  return sorted.slice(0, n);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function StepBadge({ n }: { n: number }) {
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cp-sage-700 text-sm font-bold text-white shadow-sm ring-2 ring-cp-sage-200"
      aria-hidden
    >
      {n}
    </span>
  );
}

function StepCard({
  step,
  title,
  description,
  children,
  muted,
}: {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-cp-sage-200/90 bg-gradient-to-b from-white to-cp-sage-50/30 p-4 shadow-sm sm:p-5 ${
        muted ? "opacity-55" : ""
      }`}
    >
      <div className="flex gap-3 sm:gap-4">
        <StepBadge n={step} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold tracking-tight text-cp-sage-950">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
          ) : null}
          <div className="mt-4 space-y-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default function FindNearbyPage() {
  const [mapsConfigured, setMapsConfigured] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [userLatLng, setUserLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState("");
  const [nearbyCategory, setNearbyCategory] = useState<NearbyCategory | null>(null);
  const [careIntent, setCareIntent] = useState<CareIntent>("emergency");
  const [results, setResults] = useState<{
    kind: NearbyCategory;
    message: AssistantChatMessage;
  } | null>(null);
  const resultsSectionRef = useRef<HTMLElement | null>(null);

  const locationReady = !!userLatLng;

  useEffect(() => {
    if (!results) return;
    let alive = true;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!alive) return;
        resultsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
          inline: "nearest",
        });
      });
    });
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [results]);

  useEffect(() => {
    void apiFetch("/api/journey/places-status")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setMapsConfigured(Boolean(d.configured)))
      .catch(() => setMapsConfigured(false));
  }, []);

  function pickCategory(cat: NearbyCategory) {
    if (!locationReady) return;
    setNearbyCategory(cat);
    setResults(null);
    setMapsError(null);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMapsError("Location is not available in this browser.");
      return;
    }
    setMapsLoading(true);
    setMapsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLatLng({ lat, lng });
        setLocationLabel(`Near ${lat.toFixed(4)}, ${lng.toFixed(4)} (browser location)`);
        setMapsLoading(false);
      },
      (err) => {
        setMapsError(err.message || "Could not read location");
        setMapsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60_000 },
    );
  }

  async function searchAddressToCoords() {
    const q = addressInput.trim();
    if (!q) return;
    setMapsLoading(true);
    setMapsError(null);
    try {
      const res = await apiFetch("/api/places/geocode", {
        method: "POST",
        body: JSON.stringify({ address: q }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        lat?: number;
        lng?: number;
        formattedAddress?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (
        typeof data.lat !== "number" ||
        typeof data.lng !== "number" ||
        !Number.isFinite(data.lat) ||
        !Number.isFinite(data.lng)
      ) {
        throw new Error("No coordinates returned");
      }
      setUserLatLng({ lat: data.lat, lng: data.lng });
      setLocationLabel(data.formattedAddress ?? q);
    } catch (e) {
      setMapsError(e instanceof Error ? e.message : "Geocoding failed");
    } finally {
      setMapsLoading(false);
    }
  }

  async function findNearbyGroceryMaps() {
    if (!userLatLng) {
      setMapsError("Set your location in step 1 first.");
      return;
    }
    setMapsLoading(true);
    setMapsError(null);
    try {
      const res = await apiFetch("/api/places/nearby-grocery", {
        method: "POST",
        body: JSON.stringify({
          lat: userLatLng.lat,
          lng: userLatLng.lng,
          radiusMeters: 10000,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        places?: Array<{
          name: string;
          address: string;
          mapsUrl: string;
          rating?: number;
          distanceMeters?: number | null;
        }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const places = topClosestPlaces(data.places ?? [], TOP_NEARBY);
      persistNearbyGroceryStoreNames(places.map((p) => p.name));
      const mapsPlaces = places.map((p) => ({
        name: p.name,
        address: p.address || undefined,
        mapsUrl: p.mapsUrl,
        rating: p.rating != null ? String(p.rating) : undefined,
        distanceMeters: p.distanceMeters ?? undefined,
      }));
      setResults({
        kind: "grocery",
        message: assistantMessageFromMaps(makeId(), {
          kind: "maps",
          title: "Nearby grocery stores",
          subtitle:
            "Top 3 closest by approximate distance. Open Maps to verify hours and directions.",
          mapsContext: "grocery",
          mapsPlaces,
        }),
      });
    } catch (e) {
      setMapsError(e instanceof Error ? e.message : "Maps request failed");
    } finally {
      setMapsLoading(false);
    }
  }

  async function findCareFacilitiesMaps() {
    if (!userLatLng) {
      setMapsError("Set your location in step 1 first.");
      return;
    }
    setMapsLoading(true);
    setMapsError(null);
    const titles: Record<CareIntent, string> = {
      emergency: "Emergency room (nearby)",
      urgent: "Urgent care (nearby)",
      hospital: "Hospitals (nearby)",
    };
    try {
      const res = await apiFetch("/api/places/care-facilities", {
        method: "POST",
        body: JSON.stringify({
          lat: userLatLng.lat,
          lng: userLatLng.lng,
          intent: careIntent,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        places?: Array<{
          name: string;
          address: string;
          mapsUrl: string;
          rating?: number;
          distanceMeters?: number | null;
        }>;
        disclaimer?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const places = topClosestPlaces(data.places ?? [], TOP_NEARBY);
      const mapsPlaces = places.map((p) => ({
        name: p.name,
        address: p.address || undefined,
        mapsUrl: p.mapsUrl,
        rating: p.rating != null ? String(p.rating) : undefined,
        distanceMeters: p.distanceMeters ?? undefined,
      }));
      setResults({
        kind: "care",
        message: assistantMessageFromMaps(makeId(), {
          kind: "maps",
          title: titles[careIntent],
          subtitle:
            "Top 3 closest by approximate distance. Public listings only—not medical advice. For emergencies call 911 (US).",
          mapsContext: "care",
          mapsPlaces,
          mapsDisclaimer: data.disclaimer,
        }),
      });
    } catch (e) {
      setMapsError(e instanceof Error ? e.message : "Maps request failed");
    } finally {
      setMapsLoading(false);
    }
  }

  if (!mapsConfigured) {
    return (
      <div className="cp-page">
        <div className="cp-page__inner">
          <header className="cp-page__head">
            <h1 className="cp-page__title">Find nearby</h1>
          </header>
          <div className="rounded-xl border border-dashed border-amber-200/90 bg-amber-50/50 px-4 py-4 text-sm leading-relaxed text-slate-700">
            <p className="font-semibold text-slate-900">Maps needs an API key</p>
            <p className="mt-2">
              Add <code className="rounded bg-white px-1">GOOGLE_MAPS_API_KEY</code> to{" "}
              <code className="rounded bg-white px-1">backend/.env</code>, enable{" "}
              <strong className="font-semibold">Places API</strong> and{" "}
              <strong className="font-semibold">Geocoding API</strong> in Google Cloud, then restart the
              backend.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-page">
      <div className="cp-page__inner max-w-2xl">
        <header className="cp-page__head">
          <h1 className="cp-page__title">Find nearby</h1>
          <p className="cp-page__sub">
            Set where you are, choose groceries or care, then search. We show the{" "}
            <strong>3 closest</strong> places by approximate distance. Grocery names can help Chat narrow
            price checks when you use <strong>Run selected</strong>.
          </p>
        </header>

        <div className="space-y-5">
          <StepCard
            step={1}
            title="Set your location"
            description="Use your device or enter a city, ZIP, or street address. Everything below uses this point."
          >
            <div className="flex flex-wrap gap-2">
              <SmartButton
                variant="outline"
                className="text-sm"
                onClick={() => useMyLocation()}
                disabled={mapsLoading}
              >
                Use my location
              </SmartButton>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="City, ZIP, or address"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchAddressToCoords();
                }}
              />
              <SmartButton
                variant="outline"
                className="shrink-0 text-sm sm:w-auto"
                onClick={() => void searchAddressToCoords()}
                disabled={mapsLoading || !addressInput.trim()}
              >
                Search address
              </SmartButton>
            </div>
            {locationLabel ? (
              <p className="rounded-lg border border-cp-sage-200 bg-cp-sage-50/80 px-3 py-2 text-sm font-medium text-cp-sage-950">
                <span className="text-cp-sage-700">Search point:</span> {locationLabel}
              </p>
            ) : (
              <p className="text-sm text-amber-900/90">Set a location above to continue.</p>
            )}
          </StepCard>

          <StepCard
            step={2}
            title="What do you need nearby?"
            description={
              locationReady
                ? "Pick one. You can switch anytime; running a new search updates the results below."
                : "Complete step 1 first."
            }
            muted={!locationReady}
          >
            <div className="grid items-stretch gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={!locationReady}
                onClick={() => pickCategory("grocery")}
                className={`flex h-full min-h-0 flex-col items-stretch justify-start rounded-xl border-2 px-4 py-4 text-left transition-shadow ${
                  nearbyCategory === "grocery"
                    ? "border-cp-sage-600 bg-cp-sage-50/90 shadow-md ring-1 ring-cp-sage-500/20"
                    : "border-slate-200 bg-white hover:border-cp-sage-300 hover:shadow-sm"
                } ${!locationReady ? "cursor-not-allowed" : ""}`}
              >
                <p className="m-0 text-sm font-bold leading-snug text-cp-sage-950">Grocery stores</p>
                <p className="mt-1.5 m-0 text-xs leading-relaxed text-slate-600">
                  Supermarkets near you. Names can narrow Browser Use price checks on Chat.
                </p>
              </button>
              <button
                type="button"
                disabled={!locationReady}
                onClick={() => pickCategory("care")}
                className={`flex h-full min-h-0 flex-col items-stretch justify-start rounded-xl border-2 px-4 py-4 text-left transition-shadow ${
                  nearbyCategory === "care"
                    ? "border-cp-sage-600 bg-cp-sage-50/90 shadow-md ring-1 ring-cp-sage-500/20"
                    : "border-slate-200 bg-white hover:border-cp-sage-300 hover:shadow-sm"
                } ${!locationReady ? "cursor-not-allowed" : ""}`}
              >
                <p className="m-0 text-sm font-bold leading-snug text-cp-sage-950">Care facilities</p>
                <p className="mt-1.5 m-0 text-xs leading-relaxed text-slate-600">
                  ER, urgent care, or hospitals. Maps only—not medical advice.
                </p>
              </button>
            </div>
          </StepCard>

          {locationReady && nearbyCategory === "grocery" ? (
            <StepCard
              step={3}
              title="Find grocery stores"
              description="Uses Google Maps nearby search. Straight-line distance is approximate."
            >
              <SmartButton
                variant="primary"
                className="w-full text-sm sm:w-auto"
                onClick={() => void findNearbyGroceryMaps()}
                disabled={mapsLoading}
              >
                Find 3 closest grocery stores
              </SmartButton>
            </StepCard>
          ) : null}

          {locationReady && nearbyCategory === "care" ? (
            <StepCard
              step={3}
              title="Find care on Maps"
              description="For emergencies call 911 (US). Listings are for orientation only—not medical advice."
            >
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Facility type
              </label>
              <select
                value={careIntent}
                onChange={(e) => setCareIntent(e.target.value as CareIntent)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
              >
                <option value="emergency">Emergency room</option>
                <option value="urgent">Urgent care</option>
                <option value="hospital">Hospitals</option>
              </select>
              <SmartButton
                variant="primary"
                className="w-full text-sm sm:w-auto"
                onClick={() => void findCareFacilitiesMaps()}
                disabled={mapsLoading}
              >
                Find 3 closest on Maps
              </SmartButton>
            </StepCard>
          ) : null}
        </div>

        {mapsLoading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-cp-dust-700">
            <span
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-cp-sage-200 border-t-cp-dust-700"
              aria-hidden
            />
            Contacting Maps…
          </p>
        ) : null}
        {mapsError ? (
          <p
            className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-900"
            role="alert"
          >
            {mapsError}
          </p>
        ) : null}

        {results ? (
          <section
            ref={resultsSectionRef}
            className="mt-10 scroll-mt-6 border-t border-cp-sage-200/80 pt-8"
            aria-label="Search results"
            tabIndex={-1}
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-cp-sage-800">
                Your results
              </h2>
              <p className="text-xs text-slate-500">
                {results.kind === "grocery" ? "Grocery stores" : "Care facilities"} · top{" "}
                {TOP_NEARBY} by distance
              </p>
            </div>
            <MessageCard variant="assistant" message={results.message} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
