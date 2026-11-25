import { StepRow } from "../componentWarehouse/HudSteps";
import { type SetupTeamStatus } from "../../../types/SetupTypes";

export function SetupChecklist({ status }: { status: SetupTeamStatus }) {
  const rules = status.restrictions.filter(
    (rule) => rule.satisfiable && (rule.summary || !rule.satisfied)
  );
  return (
    <ul
      data-testid="setup-checklist"
      aria-label="Setup requirements"
      className="space-y-1 border-t border-white/10 pt-2 phone:space-y-0 phone:pt-1"
    >
      {rules.map((rule) => (
        <StepRow
          key={rule.id}
          state={rule.satisfied ? "done" : "todo"}
          data-testid={`setup-rule-${rule.id}`}
          data-satisfied={rule.satisfied}
          title={rule.message}
        >
          <span className={rule.satisfied ? undefined : "text-hud-warn"}>
            {rule.summary ?? rule.message}
          </span>
        </StepRow>
      ))}
    </ul>
  );
}
