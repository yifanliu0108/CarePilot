import { SmartButton } from "./SmartButton";

export type CareIntent = "emergency" | "urgent" | "hospital";

type MapsLocationPanelProps = {
  configured: boolean;
  loading: boolean;
  error: string | null;
  /** Human-readable location when set */
  locationLabel: string | null;
  onUseMyLocation: () => void;
  address: string;
  onAddressChange: (v: string) => void;
  onSearchAddress: () => void;
  careIntent: CareIntent;
  onCareIntentChange: (v: CareIntent) => void;
  onFindGrocery: () => void;
  onFindCare: () => void;
  groceryResultCount: number;
  careResultCount: number;
};

export function MapsLocationPanel({
  configured,
  loading,
  error,
  locationLabel,
  onUseMyLocation,
  address,
  onAddressChange,
  onSearchAddress,
  careIntent,
  onCareIntentChange,
  onFindGrocery,
  onFindCare,
  groceryResultCount,
  careResultCount,
}: MapsLocationPanelProps) {
  if (!configured) {
    return (
      <div className="rounded-xl border border-dashed border-amber-200/90 bg-amber-50/50 px-3 py-3 text-xs leading-relaxed text-slate-700">
        <p className="font-semibold text-slate-900">Location & Maps (needs API key)</p>
        <p className="mt-1">
          Add <code className="rounded bg-white px-1">GOOGLE_MAPS_API_KEY</code> to{" "}
          <code className="rounded bg-white px-1">backend/.env</code>, enable{" "}
          <strong className="font-semibold">Places API</strong> and{" "}
          <strong className="font-semibold">Geocoding API</strong> in Google Cloud, then{" "}
          <strong className="font-semibold">restart the backend</strong> so it reloads the key.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-200/80 bg-gradient-to-b from-sky-50/40 to-white p-3 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-900">Location & Maps</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        We use Google Maps for nearby places. Browser Use still runs price checks on retailer sites—store
        names from Maps are passed to narrow those searches.
      </p>
      {locationLabel ? (
        <p className="mt-2 text-xs font-medium text-slate-800">{locationLabel}</p>
      ) : (
        <p className="mt-2 text-xs text-amber-800">Set a location to search nearby.</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <SmartButton variant="outline" className="text-xs" onClick={() => onUseMyLocation()} disabled={loading}>
          Use my location
        </SmartButton>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="City, ZIP, or address"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
        />
        <SmartButton
          variant="outline"
          className="shrink-0 text-xs"
          onClick={() => onSearchAddress()}
          disabled={loading || !address.trim()}
        >
          Search
        </SmartButton>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-sky-100 pt-3">
        <SmartButton variant="primary" className="text-xs" onClick={() => onFindGrocery()} disabled={loading}>
          Nearby grocery stores
        </SmartButton>
        <span className="self-center text-[11px] text-slate-500">
          {groceryResultCount > 0 ? `${groceryResultCount} found` : ""}
        </span>
      </div>
      <div className="mt-3 border-t border-sky-100 pt-3">
        <p className="text-[11px] font-semibold text-slate-700">Care facilities</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          For emergencies call <strong className="font-semibold">911</strong> (US). Maps show nearby
          options only—not medical advice.
        </p>
        <select
          value={careIntent}
          onChange={(e) => onCareIntentChange(e.target.value as CareIntent)}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
        >
          <option value="emergency">Emergency room</option>
          <option value="urgent">Urgent care</option>
          <option value="hospital">Hospitals</option>
        </select>
        <SmartButton
          variant="primary"
          className="mt-2 w-full text-xs sm:w-auto"
          onClick={() => onFindCare()}
          disabled={loading}
        >
          Find on Maps
        </SmartButton>
        {careResultCount > 0 ? (
          <p className="mt-1 text-[11px] text-slate-500">{careResultCount} places</p>
        ) : null}
      </div>
      {loading ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-sky-800">
          <span
            className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-800"
            aria-hidden
          />
          Contacting Maps…
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-900" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
