import { AgentTextProse } from "./AgentTextProse";
import { GroceryPriceBlock } from "./GroceryPriceBlock";
import { SmartButton } from "./SmartButton";
import { titleForResourceLinks } from "./resourceLinks";
import type { AssistantChatMessage, UserChatMessage } from "./types";

function introFromAssistantText(text: string) {
  const lines = text.split("\n");
  const intro: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[-*•]\s+/.test(line)) break;
    intro.push(line);
  }
  const joined = intro.join(" ").trim();
  if (joined) return joined;
  const t = text.trim();
  if (!t) return "";
  if (/^[-*•]\s+/m.test(t)) return "";
  return t;
}

type MessageCardProps =
  | { variant: "user"; message: UserChatMessage }
  | {
      variant: "assistant";
      message: AssistantChatMessage;
      showGroceryButton?: boolean;
      onCheckGroceryPrices?: () => void;
      groceryLoading?: boolean;
    };

export function MessageCard(props: MessageCardProps) {
  if (props.variant === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(100%,36rem)] rounded-2xl bg-gradient-to-br from-teal-600 to-sky-700 px-4 py-3 text-sm leading-relaxed text-white shadow-md">
          {props.message.text.split("\n").map((line, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const { message, showGroceryButton, onCheckGroceryPrices, groceryLoading } = props;

  const br = message.browserRun;
  if (br) {
    return (
      <div className="flex justify-start">
        <article className="w-full max-w-[min(100%,40rem)] rounded-xl border border-indigo-200/90 bg-white p-4 shadow-md sm:p-5">
          <header className="mb-3 border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold tracking-tight text-sky-800">✨ CarePilot</h3>
          </header>
          <div className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50/90 to-white px-3 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-800">
              Browser task results
            </p>
            <h4 className="mt-1.5 text-base font-semibold text-slate-900">{br.title}</h4>
            {br.subtitle ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{br.subtitle}</p> : null}
          </div>

          {br.kind === "grocery" && br.grocery && br.grocery.length > 0 ? (
            <GroceryPriceBlock items={br.grocery} />
          ) : null}

          {br.kind === "care" && br.carePlaces && br.carePlaces.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {br.carePlaces.map((p) => (
                <li
                  key={`${p.name}-${p.mapsUrl ?? p.address ?? ""}`}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 p-3"
                >
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  {p.address ? <p className="mt-1 text-sm text-slate-600">{p.address}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {p.mapsUrl ? (
                      <a
                        href={p.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sky-800 underline-offset-2 hover:underline"
                      >
                        Open in Maps
                      </a>
                    ) : null}
                    {p.rating ? (
                      <span className="text-xs text-slate-500">Rating: {p.rating}</span>
                    ) : null}
                  </div>
                  {p.note ? <p className="mt-2 text-xs text-slate-600">{p.note}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {br.kind === "generic" && br.rawText ? (
            <div className="mt-4 max-h-[min(70vh,28rem)] overflow-y-auto rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white p-4 shadow-inner">
              <AgentTextProse text={br.rawText} />
            </div>
          ) : null}
        </article>
      </div>
    );
  }

  const intro = introFromAssistantText(message.text);
  const hasFoods = message.foodsToTry.length > 0;
  const hasResources = message.resourceLinks.length > 0;
  const resourceSectionTitle = hasResources
    ? titleForResourceLinks(message.resourceLinks.map((r) => r.url))
    : "";
  const showStructured = hasFoods || hasResources;
  const showGroceryBtn = showGroceryButton && onCheckGroceryPrices;

  return (
    <div className="flex justify-start">
      <article className="w-full max-w-[min(100%,40rem)] rounded-xl border border-slate-200/80 bg-white p-4 shadow-md sm:p-5">
        <header className="mb-3 border-b border-slate-100 pb-2">
          <h3 className="text-sm font-bold tracking-tight text-sky-800">✨ CarePilot</h3>
        </header>

        {showStructured && intro ? (
          <p className="text-sm leading-relaxed text-slate-600">{intro}</p>
        ) : null}
        {!showStructured ? (
          <p className="text-sm leading-relaxed text-slate-600">
            {message.text.split("\n").map((line, i) => (
              <span key={i}>
                {i > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </p>
        ) : null}

        {hasFoods ? (
          <section className="mt-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-teal-700">
              Foods to try
            </h4>
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
              {message.foodsToTry.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasResources ? (
          <section className="mt-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-700">
              {resourceSectionTitle}
            </h4>
            <ul className="space-y-1.5 text-sm text-slate-700">
              {message.resourceLinks.map((link) => (
                <li key={link.url} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sky-800 underline-offset-2 hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {showGroceryBtn ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <SmartButton
              variant="outline"
              onClick={onCheckGroceryPrices}
              loading={groceryLoading}
              loadingLabel="Checking…"
              className="w-full sm:w-auto"
            >
              Check grocery prices
            </SmartButton>
          </div>
        ) : null}
      </article>
    </div>
  );
}
