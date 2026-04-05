import type { ReactNode } from "react";
import { ActionItem } from "./ActionItem";
import { SmartButton } from "./SmartButton";
import type { RecommendationAction } from "./types";

type RecommendationPanelProps = {
  /** True before any assistant reply with tasks / browser plan, and no cloud run active */
  minimal?: boolean;
  liveLoading?: boolean;
  liveError?: string | null;
  actions: RecommendationAction[];
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
  onRunSelected: () => void;
  runLoading: boolean;
  runDisabled: boolean;
  liveSummary?: ReactNode;
  children?: ReactNode;
};

export function RecommendationPanel({
  minimal = false,
  liveLoading = false,
  liveError = null,
  actions,
  checkedIds,
  onToggle,
  onRunSelected,
  runLoading,
  runDisabled,
  liveSummary,
  children,
}: RecommendationPanelProps) {
  if (minimal) {
    return (
      <aside
        className="flex max-h-[50vh] min-h-0 w-full flex-col border-t border-slate-200/80 bg-slate-100/80 lg:max-h-none lg:w-[min(32%,420px)] lg:shrink-0 lg:flex-none lg:border-l lg:border-t-0 lg:border-slate-200/80 xl:w-[30%]"
        aria-label="Browser Use"
      >
        <div className="cp-browser-use-minimal__align flex min-h-[11rem] flex-1 flex-col px-5 lg:min-h-0">
          <div className="mx-auto w-full max-w-[16rem] shrink-0 text-center lg:text-left">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Browser Use
            </p>
            <p className="mt-3 text-sm font-medium text-slate-600">Waiting for a plan</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Chat on the left first. When the assistant returns steps or a browser task, this panel
              opens so you can run them in the cloud.
            </p>
            {liveLoading ? (
              <p
                className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-600"
                role="status"
                aria-live="polite"
              >
                <span
                  className="size-2 shrink-0 animate-pulse rounded-full bg-sky-500"
                  aria-hidden
                />
                Planning…
              </p>
            ) : null}
            {liveError ? (
              <p
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-xs text-red-800"
                role="alert"
              >
                {liveError}
              </p>
            ) : null}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex max-h-[50vh] min-h-0 w-full flex-col border-t border-slate-200/80 bg-slate-100/80 lg:max-h-none lg:w-[min(32%,420px)] lg:shrink-0 lg:flex-none lg:border-l lg:border-t-0 lg:border-slate-200/80 xl:w-[30%]"
      aria-label="Recommendations"
    >
      <div className="shrink-0 border-b border-slate-200/80 px-4 py-4 sm:px-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-sky-900">
          Recommendation
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Use the checkboxes to choose what you want the browser agent to work on. Only checked
          items are included when you run a cloud session. Quick links in the chat stay available
          anytime—this list is for automated browsing.
        </p>
        <div className="mt-3">
          <SmartButton
            variant="primary"
            className="w-full py-2.5 text-sm sm:w-auto sm:min-w-[8.5rem]"
            onClick={() => onRunSelected()}
            disabled={runDisabled}
            loading={runLoading}
            loadingLabel="Running…"
          >
            Run selected
          </SmartButton>
        </div>
        {liveSummary ? <div className="mt-3 text-xs text-slate-600">{liveSummary}</div> : null}
        {liveError ? (
          <p
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            role="alert"
          >
            {liveError}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4 sm:px-5">
        {actions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-6 text-center text-sm text-slate-500">
            No runnable steps yet. Send a message to get suggested steps here. Grocery price checks
            appear only when your plan includes shopping items.
          </p>
        ) : (
          actions.map((action) => (
            <ActionItem
              key={action.id}
              action={action}
              checked={checkedIds.has(action.id)}
              onToggle={() => onToggle(action.id)}
            />
          ))
        )}
        {children}
      </div>
    </aside>
  );
}
