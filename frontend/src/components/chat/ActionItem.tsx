import type { RecommendationAction } from "./types";

type ActionItemProps = {
  action: RecommendationAction;
  checked: boolean;
  onToggle: () => void;
};

export function ActionItem({ action, checked, onToggle }: ActionItemProps) {
  const order = action.stepOrder;
  return (
    <div className="group rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition hover:border-cp-sage-200/80 hover:shadow-md">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-cp-sage-600 focus:ring-cp-sage-500"
        />
        {order != null ? (
          <span
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-cp-sage-100 text-[11px] font-extrabold text-cp-sage-900"
            aria-hidden
          >
            {order}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800">
          {action.label}
        </span>
      </label>
    </div>
  );
}
