import { SetupTeamStatus } from "../../../types/SetupTypes";

export function SetupChecklist({ status }: { status: SetupTeamStatus }) {
  const rules = status.restrictions.filter(
    (rule) => rule.satisfiable && (rule.summary || !rule.satisfied)
  );
  return (
    <ul
      data-testid="setup-checklist"
      aria-label="Setup requirements"
      className="space-y-1 border-t border-white/10 pt-2 font-hud-body text-hud-xs leading-snug"
    >
      {rules.map((rule) => (
        <li
          key={rule.id}
          data-testid={`setup-rule-${rule.id}`}
          data-satisfied={rule.satisfied}
          title={rule.message}
          className={`flex gap-1.5 ${rule.satisfied ? "text-hud-dim" : "text-hud-warn"}`}
        >
          <span aria-hidden="true">{rule.satisfied ? "✓" : "○"}</span>
          <span>{rule.summary ?? rule.message}</span>
        </li>
      ))}
    </ul>
  );
}
