import type { BrowserSession } from "./journeyTypes";
import { formatJourneyIntent } from "./journeyIntentLabel";

type BrowserPlanOverviewProps = {
  live: BrowserSession | null;
  intent: string | null;
  loading: boolean;
};

export function BrowserPlanOverview({ live, intent, loading }: BrowserPlanOverviewProps) {
  if (!loading && !live) return null;

  return (
    <div
      className="cp-browser-plan-overview rounded-xl border border-cp-sage-200/80 bg-gradient-to-br from-white to-cp-sage-50/40 px-3.5 py-3 shadow-sm"
      aria-label="Structured plan from Gemini"
    >
      {loading && !live ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-3 w-2/3 max-w-[14rem] animate-pulse rounded bg-slate-200/90" />
          <div className="h-3 w-full max-w-[18rem] animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-5/6 max-w-[16rem] animate-pulse rounded bg-slate-100" />
          <p className="text-[11px] font-medium uppercase tracking-wide text-cp-sage-700">
            Gemini · structuring your plan…
          </p>
        </div>
      ) : live ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="cp-browser-plan-overview__intent">
              {formatJourneyIntent(intent)}
            </span>
            <span className="cp-browser-plan-overview__badge">{live.status}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {live.mode === "gemini" ? "Gemini browser plan" : live.mode}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-snug text-slate-900">{live.task}</p>
          {live.steps && live.steps.length > 0 ? (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              <strong className="text-slate-800">{live.steps.length}</strong> steps below — choose what
              to run, then <strong className="text-slate-800">Run selected</strong>.
            </p>
          ) : live.actions.length > 0 ? (
            <p className="mt-1.5 text-xs text-slate-600">Quick links below — open resources while you chat.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
