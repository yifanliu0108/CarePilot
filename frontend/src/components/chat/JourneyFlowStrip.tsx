export type JourneyPhase = "ask" | "plan" | "run" | "results";

type StepDef = { id: JourneyPhase; label: string; hint: string };

const STEPS: StepDef[] = [
  { id: "ask", label: "Chat", hint: "Describe your goal" },
  { id: "plan", label: "Plan", hint: "See Recommendation" },
  { id: "run", label: "Run", hint: "Cloud browser" },
  { id: "results", label: "Results", hint: "See chat + panel" },
];

export type RagSource = { id: string; title: string };

type JourneyFlowStripProps = {
  phase: JourneyPhase;
  liveLoading: boolean;
  ragSources?: RagSource[] | null;
};

export function JourneyFlowStrip({ phase, liveLoading, ragSources }: JourneyFlowStripProps) {
  return (
    <div className="cp-journey-flow" aria-label="Care journey steps">
      <ol className="cp-journey-flow__steps">
        {STEPS.map((s, i) => {
          const active = s.id === phase;
          return (
            <li
              key={s.id}
              className={`cp-journey-flow__step${active ? " cp-journey-flow__step--active" : ""}`}
              aria-current={active ? "step" : undefined}
            >
              <span className="cp-journey-flow__num" aria-hidden>
                {i + 1}
              </span>
              <span className="cp-journey-flow__text">
                <span className="cp-journey-flow__label">{s.label}</span>
                <span className="cp-journey-flow__hint">{s.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {liveLoading ? (
        <p className="cp-journey-flow__status" role="status" aria-live="polite">
          <span className="cp-journey-flow__dot" aria-hidden />
          Gemini is updating your structured plan…
        </p>
      ) : null}
      {ragSources && ragSources.length > 0 ? (
        <div className="cp-journey-flow__rag">
          <span className="cp-journey-flow__rag-label">Knowledge base</span>
          <ul className="cp-journey-flow__rag-list">
            {ragSources.slice(0, 5).map((r) => (
              <li key={r.id}>{r.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
