import { RosterName, TeamSpecialRule } from "../../../types/Team";
import {
  getAvailableRosterNames,
  getRosterByRosterName,
} from "../../../data/RosterTemplates";
import { cx, hudChoiceClass } from "../componentWarehouse/HudKit";

export function RosterPicker({
  onChoose,
}: {
  onChoose: (roster: RosterName) => void;
}) {
  return (
    <div
      role="list"
      aria-label="Rosters"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {getAvailableRosterNames().map((name) => {
        const roster = getRosterByRosterName(name);

        const positions = [
          ...new Set(
            roster.playerTemplates.map((p) =>
              p.positionName.startsWith(`${name} `)
                ? p.positionName.slice(name.length + 1)
                : p.positionName
            )
          ),
        ];
        return (
          <div role="listitem" key={name}>
            <button
              type="button"
              data-testid={`roster-choice-${name}`}
              onClick={() => {
                onChoose(name);
              }}
              className={cx(
                hudChoiceClass(false),
                "flex h-full w-full flex-col gap-2 p-3"
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.03em] text-hud-bone">
                  {name}
                </span>
                <span className="hud-label shrink-0">Tier {roster.tier}</span>
              </span>
              {roster.specialRules.length > 0 && (
                <span className="text-hud-sm text-hud-gold">
                  {roster.specialRules
                    .map((rule) =>
                      rule === TeamSpecialRule.FAVOURED_OF
                        ? "Favoured of a Chaos god"
                        : rule
                    )
                    .join(", ")}
                </span>
              )}
              <span className="text-hud-sm text-hud-dim">
                {positions.join(" · ")}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
