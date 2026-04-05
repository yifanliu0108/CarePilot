import type { ReactNode } from "react";
import { ActionItem } from "./ActionItem";
import { SmartButton } from "./SmartButton";
import type { RecommendationAction } from "./types";

type RecommendationPanelProps = {
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
  actions,
  checkedIds,
  onToggle,
  onRunSelected,
  runLoading,
  runDisabled,
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
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4 sm:px-5">
        {actions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-6 text-center text-sm text-slate-500">
            Send a message to get suggested steps here. Grocery price checks appear only when your
            plan includes shopping items.
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
