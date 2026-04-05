import type { ReactNode } from "react";
import { ActionItem } from "./ActionItem";
import type { RecommendationAction } from "./types";

type RecommendationPanelProps = {
  actions: RecommendationAction[];
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
  onBrowserUse: (action: RecommendationAction) => void;
  browserUseLoading: boolean;
  browserUseDisabled: boolean;
  liveSummary?: ReactNode;
  children?: ReactNode;
};

export function RecommendationPanel({
  actions,
  checkedIds,
  onToggle,
  onBrowserUse,
  browserUseLoading,
  browserUseDisabled,
  liveSummary,
  children,
}: RecommendationPanelProps) {
  return (
    <aside
      className="flex max-h-[50vh] min-h-0 w-full flex-col bg-slate-100/80 lg:max-h-none lg:w-[min(32%,420px)] lg:shrink-0 lg:flex-none xl:w-[30%]"
      aria-label="Recommendations"
    >
      <div className="shrink-0 border-b border-slate-200/80 px-4 py-4 sm:px-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-sky-900">
          Recommendation
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Links in the chat open instantly. Browser Use runs only when you tap Run and can take a minute
          or more — use it when you want live price checks.
        </p>
        {liveSummary ? <div className="mt-3 text-xs text-slate-600">{liveSummary}</div> : null}
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4 sm:px-5">
        {actions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-6 text-center text-sm text-slate-500">
            Send a message to get steps and optional grocery checks here.
          </p>
        ) : (
          actions.map((action) => (
            <ActionItem
              key={action.id}
              action={action}
              checked={checkedIds.has(action.id)}
              onToggle={() => onToggle(action.id)}
              onRun={action.type === "browseruse" ? () => onBrowserUse(action) : undefined}
              runLoading={action.type === "browseruse" ? browserUseLoading : false}
              runDisabled={action.type === "browseruse" ? browserUseDisabled : false}
            />
          ))
        )}
        {children}
      </div>
    </aside>
  );
}
