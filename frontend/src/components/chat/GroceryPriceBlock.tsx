import type { GroceryQueryResult } from "./types";

export function GroceryPriceBlock({ items }: { items: GroceryQueryResult[] }) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Grocery snapshot</p>
      {items.map((row) => (
        <div key={row.query} className="rounded-lg border border-slate-200 bg-white p-2">
          <p className="mb-2 text-sm font-semibold text-slate-800">{row.query}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-xs text-slate-600">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-1.5 pr-2 font-semibold">Store</th>
                  <th className="py-1.5 pr-2 font-semibold">Product</th>
                  <th className="py-1.5 pr-2 font-semibold">Price</th>
                  <th className="py-1.5 font-semibold">Open</th>
                </tr>
              </thead>
              <tbody>
                {(row.results ?? []).map((r, i) => (
                  <tr key={`${row.query}-${r.store}-${i}`} className="border-b border-slate-50">
                    <td className="py-1.5 pr-2 align-top">{r.store}</td>
                    <td className="py-1.5 pr-2 align-top">
                      {r.productUrl ? (
                        <a
                          href={r.productUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-sky-700 underline-offset-2 hover:underline"
                        >
                          {r.product || "—"}
                        </a>
                      ) : (
                        (r.product ?? "—")
                      )}
                    </td>
                    <td className="py-1.5 pr-2 align-top whitespace-nowrap">{r.price ?? "—"}</td>
                    <td className="py-1.5 align-top">
                      {r.searchUrl ? (
                        <a
                          href={r.searchUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-700 underline-offset-2 hover:underline"
                        >
                          Search
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
