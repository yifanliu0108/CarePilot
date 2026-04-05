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
