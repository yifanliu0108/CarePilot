import { useEffect, useState } from "react";
import type { CloudSessionView } from "./journeyTypes";
import { CloudTaskOutput } from "./CloudTaskOutput";

type CloudRunStatusProps = {
  connecting: boolean;
  session: CloudSessionView | null;
  error: string | null;
  /** Whether the cloud session is still executing (from parent / API). */
  sessionRunning: boolean;
};

export function CloudRunStatus({
  connecting,
  session,
  error,
  sessionRunning,
}: CloudRunStatusProps) {
  const [elapsed, setElapsed] = useState(0);

  const active = connecting || sessionRunning;
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const t0 = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active, session?.id, connecting]);

  return (
    <>
      {connecting && !session ? (
        <div
          className="cp-cloud-run cp-cloud-run--connecting rounded-xl border border-cp-sage-200 bg-cp-sage-50/90 px-3 py-3 text-sm text-cp-sage-900 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 size-5 shrink-0 animate-spin rounded-full border-2 border-cp-sage-300 border-t-cp-dust-700"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-cp-sage-950">Starting cloud browser…</p>
              <p className="mt-0.5 text-xs text-cp-sage-800/90">
                Queuing your task on Browser Use. This can take a minute — results appear here and in
                chat.
              </p>
              <p className="mt-2 font-mono text-[11px] text-cp-sage-700/80">Elapsed {elapsed}s</p>
            </div>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-cp-sage-200/80" aria-hidden>
            <div className="h-full w-full animate-pulse rounded-full bg-cp-sage-400/90" />
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="alert"
        >
          Cloud: {error}
        </p>
      ) : null}

      {session ? (
        <div className="cp-cloud-run cp-cloud-run--session rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Cloud run</span>
            <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">
              {session.id.slice(0, 8)}…
            </code>
            <span className="text-slate-400">·</span>
            <span className="font-medium text-slate-800">{session.status}</span>
            <span className="text-slate-400">·</span>
            <span>
              {session.stepCount} step{session.stepCount === 1 ? "" : "s"}
            </span>
            {sessionRunning ? (
              <span className="inline-flex items-center gap-1 text-cp-dust-700">
                <span className="size-1.5 animate-pulse rounded-full bg-cp-dust-500" aria-hidden />
                running · {elapsed}s
              </span>
            ) : (
              <span className="text-emerald-700">finished</span>
            )}
          </div>

          {sessionRunning ? (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200" aria-hidden>
              <div className="h-full w-full animate-pulse rounded-full bg-cp-dust-500/80" />
            </div>
          ) : null}

          {session.lastStepSummary ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{session.lastStepSummary}</p>
          ) : null}

          {session.liveUrl ? (
            <>
              <a
                className="mt-2 inline-block text-sm font-semibold text-cp-dust-700 underline-offset-2 hover:underline"
                href={session.liveUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open live browser (new tab)
              </a>
              <iframe
                className="mt-2 h-48 w-full rounded-lg border border-slate-200"
                title="Browser Use Cloud live view"
                src={session.liveUrl}
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            </>
          ) : null}

          {!sessionRunning ? (
            <p className="mt-2 text-[11px] text-slate-500">
              A formatted copy is also in the chat thread above.
            </p>
          ) : null}

          <CloudTaskOutput output={session.output} status={session.status} />
        </div>
      ) : null}
    </>
  );
}
