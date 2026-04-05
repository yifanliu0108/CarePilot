import type { RefObject } from "react";
import { Logo } from "../Logo";
import { MessageCard } from "./MessageCard";
import type { ChatMessage } from "./types";
import { SmartButton } from "./SmartButton";

type ChatWindowProps = {
  className?: string;
  listRef: RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  liveLoading: boolean;
  cloudConfigured: boolean;
  liveExists: boolean;
  onCheckGroceryPrices?: () => void;
  cloudActive: boolean;
};

export function ChatWindow({
  className = "",
  listRef,
  messages,
  draft,
  setDraft,
  onSend,
  liveLoading,
  cloudConfigured,
  liveExists,
  onCheckGroceryPrices,
  cloudActive,
}: ChatWindowProps) {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastAssistantId = lastAssistant?.role === "assistant" ? lastAssistant.id : null;
  const showGroceryOnCard =
    Boolean(lastAssistantId && cloudConfigured && liveExists && onCheckGroceryPrices);

  return (
    <section
      className={`flex min-h-0 min-w-0 flex-1 flex-col border-b border-cp-sage-900/10 bg-gradient-to-br from-[var(--cp-chat-from)]/90 via-[var(--cp-chat-via)] to-[var(--cp-chat-to)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] lg:border-b-0 lg:border-r lg:border-r-cp-sage-900/12 ${className}`}
      aria-label="CarePilot chat"
    >
      <header className="shrink-0 border-b border-white/35 bg-[rgb(237_242_244/0.58)] px-4 py-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] backdrop-blur-[22px] backdrop-saturate-[145%] sm:px-6">
        <h1 className="m-0 flex w-max max-w-full">
          <Logo variant="compact" />
        </h1>
      </header>

      {liveLoading ? (
        <div
          className="cp-chat-planning-strip shrink-0 border-b border-cp-sage-900/10 bg-cp-sage-50/85 px-4 py-2 text-xs text-cp-sage-900 sm:px-6"
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-2">
            <span
              className="size-2 shrink-0 animate-pulse rounded-full bg-cp-dust-600"
              aria-hidden
            />
            <span className="font-medium">Google Gemini is drafting your plan…</span>
          </span>
          <span className="mt-0.5 block text-[11px] text-cp-sage-800/85 sm:mt-0 sm:ml-4 sm:inline">
            Live actions will update when the structured steps are ready.
          </span>
        </div>
      ) : null}

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
        role="log"
        aria-live="polite"
      >
        {messages.map((msg) => {
          if (msg.role === "user") {
            return <MessageCard key={msg.id} variant="user" message={msg} />;
          }
          const onGrocery =
            msg.id === lastAssistantId && showGroceryOnCard ? onCheckGroceryPrices : undefined;
          return (
            <MessageCard
              key={msg.id}
              variant="assistant"
              message={msg}
              showGroceryButton={msg.id === lastAssistantId && showGroceryOnCard}
              onCheckGroceryPrices={onGrocery}
              groceryLoading={msg.id === lastAssistantId ? cloudActive : false}
            />
          );
        })}
      </div>

      <div className="shrink-0 border-t border-cp-sage-900/12 bg-[var(--cp-chat-inputbar)]/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <label className="visually-hidden" htmlFor="cp-guardian-input">
          Message
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            id="cp-guardian-input"
            rows={2}
            placeholder="e.g. Foods that might help with sleep and recovery…"
            value={draft}
            disabled={liveLoading}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            className="min-h-[44px] w-full resize-none rounded-xl border border-cp-sage-900/15 bg-white/90 px-3 py-2.5 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-cp-sage-600 focus:outline-none focus:ring-2 focus:ring-cp-sage-500/30"
          />
          <SmartButton
            type="button"
            variant="primary"
            className="h-[42px] w-full shrink-0 px-6 sm:w-auto"
            onClick={onSend}
            disabled={liveLoading}
            loading={liveLoading}
            loadingLabel="Sending…"
          >
            Send
          </SmartButton>
        </div>
      </div>
    </section>
  );
}
