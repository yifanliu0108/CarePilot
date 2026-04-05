import type { ReactNode } from "react";

/** Renders **bold** segments inside a line. */
function inlineBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    const m = p.match(/^\*\*(.+)\*\*$/);
    if (m) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {m[1]}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "blank" };

function lineToBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const t = line.trim();

    if (t === "") {
      blocks.push({ type: "blank" });
      i += 1;
      continue;
    }

    const h3 = t.match(/^###\s+(.+)$/);
    const h2 = t.match(/^##\s+(.+)$/);
    const h1 = t.match(/^#\s+(.+)$/);
    if (h3) {
      blocks.push({ type: "h3", text: h3[1] });
      i += 1;
      continue;
    }
    if (h2) {
      blocks.push({ type: "h2", text: h2[1] });
      i += 1;
      continue;
    }
    if (h1) {
      blocks.push({ type: "h2", text: h1[1] });
      i += 1;
      continue;
    }

    if (/^[-*•]\s*/.test(t)) {
      const items: string[] = [];
      while (i < lines.length) {
        const L = lines[i].trim();
        const bullet = L.match(/^[-*•]\s*(.+)$/);
        if (bullet) {
          items.push(bullet[1]);
          i += 1;
        } else break;
      }
      if (items.length) blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+[).]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length) {
        const L = lines[i].trim();
        const num = L.match(/^\d+[).]\s+(.+)$/);
        if (num) {
          items.push(num[1]);
          i += 1;
        } else break;
      }
      if (items.length) blocks.push({ type: "ol", items });
      continue;
    }

    blocks.push({ type: "p", text: t });
    i += 1;
  }
  return blocks;
}

function looksLikeJson(s: string): boolean {
  const x = s.trim();
  return (x.startsWith("{") && x.endsWith("}")) || (x.startsWith("[") && x.endsWith("]"));
}

/**
 * Readable, on-brand rendering for agent long-form text (markdown-like).
 * Avoids terminal-style dark blocks.
 */
export function AgentTextProse({
  text,
  className = "",
  variant = "default",
}: {
  text: string;
  className?: string;
  /** Larger type and spacing for main chat assistant replies. */
  variant?: "default" | "assistant";
}) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const bodyTone =
    variant === "assistant"
      ? "space-y-4 text-[15px] leading-[1.65] text-slate-700 [&_strong]:text-slate-900 [&_ul]:my-1 [&_ol]:my-1"
      : "space-y-3 text-sm leading-relaxed text-slate-700 [&_strong]:text-slate-900";

  if (looksLikeJson(trimmed)) {
    let jsonPretty: string | null = null;
    try {
      const parsed = JSON.parse(trimmed);
      jsonPretty = JSON.stringify(parsed, null, 2);
    } catch {
      /* fall through to markdown path */
    }
    if (jsonPretty !== null) {
      return (
        <div
          className={`rounded-xl border border-slate-200 bg-slate-50/90 p-4 ${className}`}
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Structured data
          </p>
          <pre className="max-h-56 overflow-auto font-mono text-[12px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
            {jsonPretty}
          </pre>
        </div>
      );
    }
  }

  const lines = text.split("\n");
  const blocks = lineToBlocks(lines);

  return (
    <div className={`${bodyTone} ${className}`}>
      {blocks.map((b, idx) => {
        if (b.type === "blank") {
          return <div key={`b-${idx}`} className="h-1" />;
        }
        if (b.type === "h2") {
          return (
            <h3
              key={`h2-${idx}`}
              className={`border-b border-slate-100 pb-1.5 font-semibold tracking-tight text-slate-900 ${
                variant === "assistant" ? "text-lg" : "text-base"
              }`}
            >
              {inlineBold(b.text)}
            </h3>
          );
        }
        if (b.type === "h3") {
          return (
            <h4
              key={`h3-${idx}`}
              className={`font-semibold text-slate-900 ${variant === "assistant" ? "text-base" : "text-[15px]"}`}
            >
              {inlineBold(b.text)}
            </h4>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={`ul-${idx}`} className="ml-1 space-y-2.5 border-l-2 border-cp-sage-200/80 pl-3">
              {b.items.map((item, j) => (
                <li key={j} className="leading-relaxed">
                  {inlineBold(item)}
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol
              key={`ol-${idx}`}
              className="ml-4 list-decimal space-y-2 marker:font-semibold marker:text-cp-sage-700"
            >
              {b.items.map((item, j) => (
                <li key={j} className="pl-1 leading-relaxed">
                  {inlineBold(item)}
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={`p-${idx}`} className="leading-relaxed">
            {inlineBold(b.text)}
          </p>
        );
      })}
    </div>
  );
}
