import { AgentTextProse } from "./AgentTextProse";
import { cloudStatusStillRunning } from "./cloudStatus";
import { parseGroceryCloudOutput } from "./cloudTaskFormat";
import { GroceryPriceBlock } from "./GroceryPriceBlock";

export function CloudTaskOutput({ output, status }: { output: unknown; status: string }) {
  if (output == null || cloudStatusStillRunning(status)) return null;
  const parsed = parseGroceryCloudOutput(output);
  if (parsed) {
    return <GroceryPriceBlock items={parsed.items} />;
  }
  const text =
    typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return (
    <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white p-3 shadow-inner">
      <AgentTextProse text={text} />
    </div>
  );
}
