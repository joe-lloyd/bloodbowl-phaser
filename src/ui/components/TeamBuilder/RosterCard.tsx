import { getRosterByRosterName } from "../../../data/RosterTemplates";
import { type RosterName, TeamSpecialRule } from "../../../types/Team";
import { cx, hudChoiceClass } from "../componentWarehouse/HudKit";
import "./rosterPicker.css";

export function RosterCard({
  name,
  onChoose,
}: {
  readonly name: RosterName;
  readonly onChoose: (roster: RosterName) => void;
}) {
  const roster = getRosterByRosterName(name);
  const art = `/assets/roster-picker/${encodeURIComponent(name)}`;
  const rules = roster.specialRules.map((rule) =>
    rule === TeamSpecialRule.FAVOURED_OF ? "Favoured of a Chaos god" : rule
  );
  return (
    <button
      type="button"
      data-testid={`roster-choice-${name}`}
      onClick={() => {
        onChoose(name);
      }}
      className={cx(
        hudChoiceClass(false),
        "roster-picker-card flex h-full w-full flex-col p-3"
      )}
    >
      <span className="flex w-full items-baseline justify-between gap-2">
        <span className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.03em] text-hud-bone">
          {name}
        </span>
        <span className="hud-label shrink-0">Tier {roster.tier}</span>
      </span>
      <span aria-hidden="true" className="roster-picker-lineup">
        <img
          src={`${art}.png`}
          alt=""
          width={1760}
          height={126}
          loading="lazy"
          decoding="async"
        />
      </span>
      {rules.length > 0 && (
        <span className="text-hud-sm text-hud-gold">{rules.join(", ")}</span>
      )}
      <span className="sr-only">
        {roster.playerTemplates.map((player) => player.positionName).join(", ")}
      </span>
    </button>
  );
}
