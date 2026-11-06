export type Step = { id: string; label: string };

type StepperProps = {
  steps: Step[];
  active: string;
  done?: string[];
  failed?: string;
};

export function Stepper({ steps, active, done = [], failed }: StepperProps) {
  return (
    <ol className="stepper">
      {steps.map((step, index) => {
        const state = done.includes(step.id)
          ? "done"
          : failed === step.id
            ? "failed"
            : active === step.id
              ? "active"
              : "pending";
        return (
          <li key={step.id} className={`step step-${state}`}>
            <span className="step-dot" aria-hidden="true">
              {state === "done" ? "✓" : state === "failed" ? "×" : index + 1}
            </span>
            <span className="step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
