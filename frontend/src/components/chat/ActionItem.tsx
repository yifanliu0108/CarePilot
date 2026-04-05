import type { RecommendationAction } from "./types";

type ActionItemProps = {
  action: RecommendationAction;
  checked: boolean;
  onToggle: () => void;
};

export function ActionItem({ action, checked, onToggle }: ActionItemProps) {
  return (
    <div className="group rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition hover:border-teal-200/80 hover:shadow-md">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
        />
        <span className="text-sm font-medium leading-snug text-slate-800">{action.label}</span>
      </label>
    </div>
  );
}
