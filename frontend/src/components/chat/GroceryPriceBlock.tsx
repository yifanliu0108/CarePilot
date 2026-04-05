import type { GroceryQueryResult } from "./types";

function StoreBadge({ name }: { name: string }) {
  const n = name.trim() || "Store";
  return (
    <span className="inline-flex max-w-[10rem] shrink-0 truncate rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
      {n}
    </span>
  );
}

function ResultRow({
  store,
  product,
  price,
  productUrl,
  searchUrl,
  density,
}: {
  store: string;
  product: string;
  price: string;
  productUrl?: string;
  searchUrl?: string;
  density: "default" | "compact";
}) {
  const priceLabel = (price ?? "—").trim() || "—";
  const productLine = (product ?? "—").trim() || "—";
  const py = density === "compact" ? "py-2.5" : "py-3";

  return (
    <li className={`border-b border-slate-100 last:border-b-0 ${py}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <StoreBadge name={store} />
            <span
              className={`tabular-nums font-semibold text-teal-900 ${density === "compact" ? "text-sm" : "text-base"}`}
            >
              {priceLabel}
            </span>
          </div>
          <p className="text-sm leading-snug text-slate-800">{productLine}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:pt-0.5 sm:pl-2">
          {productUrl ? (
            <a
              href={productUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-teal-200/90 bg-white px-2.5 py-1.5 text-xs font-medium text-teal-900 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/80"
            >
              View product
            </a>
          ) : null}
          {searchUrl ? (
            <a
              href={searchUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Search on site
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function SubstitutionsSection({
  text,
  density,
}: {
  text: string;
  density: "default" | "compact";
}) {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const body =
    paras.length > 0
      ? paras
      : text
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

  return (
    <section
      className={`rounded-xl border border-amber-100/90 bg-gradient-to-b from-amber-50/60 to-white p-3 sm:p-4 ${density === "compact" ? "p-2.5 sm:p-3" : ""}`}
    >
      <h5
        className={`mb-2 font-semibold text-amber-950 ${density === "compact" ? "text-sm" : "text-[15px]"}`}
      >
        Substitution ideas
      </h5>
      <div className="space-y-2 text-sm leading-relaxed text-slate-700">
        {body.map((para, i) => {
          const bullet = /^[-*•]\s+(.+)$/.exec(para);
          if (bullet) {
            return (
              <p key={i} className="flex gap-2 pl-0.5">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-amber-400/90" aria-hidden />
                <span>{bullet[1]}</span>
              </p>
            );
          }
          return (
            <p key={i} className="pl-1">
              {para}
            </p>
          );
        })}
      </div>
    </section>
  );
}

export function GroceryPriceBlock({
  items,
  substitutionsNote,
  density = "default",
}: {
  items: GroceryQueryResult[];
  /** Prose from agent JSON (`substitutions` field). */
  substitutionsNote?: string;
  density?: "default" | "compact";
}) {
  const outerPad = density === "compact" ? "p-3" : "p-4 sm:p-5";
  const headingClass = density === "compact" ? "text-sm" : "text-[15px]";
  const showSubs = Boolean(substitutionsNote?.trim());
  const showPrices = items.length > 0;

  return (
    <div
      className={`mt-3 overflow-hidden rounded-2xl border border-teal-200/50 bg-white shadow-sm ring-1 ring-teal-900/[0.04] ${density === "compact" ? "shadow-none ring-slate-200/60" : ""}`}
    >
      <div className={outerPad}>
        <div className="space-y-4">
          {showPrices
            ? items.map((block) => (
                <section
                  key={block.query}
                  className="rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50/80 to-white p-3 sm:p-4"
                >
                  <h5
                    className={`mb-3 border-l-[3px] border-teal-500 pl-3 font-semibold leading-snug text-slate-900 ${headingClass}`}
                  >
                    {block.query}
                  </h5>
                  <ul className="rounded-lg bg-white px-2 sm:px-3">
                    {(block.results ?? []).map((r, i) => (
                      <ResultRow
                        key={`${block.query}-${r.store}-${i}`}
                        store={r.store}
                        product={r.product}
                        price={r.price}
                        productUrl={r.productUrl}
                        searchUrl={r.searchUrl}
                        density={density}
                      />
                    ))}
                  </ul>
                </section>
              ))
            : null}
          {showSubs ? <SubstitutionsSection text={substitutionsNote!.trim()} density={density} /> : null}
        </div>
        <p className="mt-4 border-t border-slate-100 pt-3 text-center text-[11px] leading-relaxed text-slate-500">
          Public listings only—verify price and availability on the store site.
        </p>
      </div>
    </div>
  );
}
