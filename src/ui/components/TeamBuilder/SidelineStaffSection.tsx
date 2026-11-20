import { type Team } from "../../../types/Team";
import {
  type StaffItem,
  draftInducementCount,
  priceOf,
} from "../../../game/rules/teamPricing";
import { inducementCatalog } from "../../../game/inducements/catalog";
import { APOTHECARY_COST } from "../../../game/rules/sevensPrices";
import { teamDraftRules, teamGameType } from "../../../game/rules/draftRules";
import { HudButton, Section } from "../componentWarehouse/HudKit";
import { formatGold } from "../TeamManagement/TeamStatsOverview";

export function SidelineStaffSection({
  team,
  active,
  onBuy,
  onApothecaryToggle,
}: {
  team: Team;
  active: boolean;
  onBuy: (item: StaffItem) => void;
  onApothecaryToggle: () => void;
}) {
  const apothecaryPrice = priceOf(team, { type: "apothecary" });
  const draft = teamDraftRules(team);
  return (
    <Section title="Sideline staff" aside={`Gold ${formatGold(team.treasury)}`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StaffCounter
          label="Re-Rolls"
          count={team.rerolls}
          team={team}
          item={{ type: "reroll" }}
          onBuy={onBuy}
        />
        {draft.apothecary && (
          <label className="flex flex-col gap-1">
            <span className="hud-label">
              Apothecary ({formatGold(APOTHECARY_COST)})
            </span>
            <span className="flex h-11 items-center justify-between rounded-hud border border-white/10 bg-black/35 px-3">
              <span className="font-hud-display text-hud-lg">
                {team.apothecary ? "Yes" : "No"}
              </span>
              <input
                type="checkbox"
                checked={team.apothecary}
                onChange={onApothecaryToggle}
                disabled={
                  team.apothecary
                    ? active
                    : team.treasury < (apothecaryPrice.amount ?? Infinity)
                }
                title={apothecaryPrice.reason}
                className="hud-check"
              />
            </span>
          </label>
        )}
        <StaffCounter
          label="Dedicated Fans"
          count={team.dedicatedFans}
          team={team}
          item={{ type: "dedicated-fan" }}
          onBuy={onBuy}
        />
        {draft.assistantCoaches && (
          <StaffCounter
            label="Asst. Coaches"
            count={team.coaches}
            team={team}
            item={{ type: "coach" }}
            onBuy={onBuy}
          />
        )}
        {draft.cheerleaders && (
          <StaffCounter
            label="Cheerleaders"
            count={team.cheerleaders}
            team={team}
            item={{ type: "cheerleader" }}
            onBuy={onBuy}
          />
        )}
      </div>
    </Section>
  );
}

export function DraftInducementsSection({
  team,
  onBuy,
}: {
  team: Team;
  onBuy: (item: StaffItem) => void;
}) {
  if (team.advancementMode !== "matched-play") return null;
  return (
    <Section title="Inducements on the draft list">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {inducementCatalog(team, teamGameType(team)).map((entry) => (
          <StaffCounter
            key={entry.inducement}
            label={entry.inducement}
            count={draftInducementCount(team, entry.inducement)}
            team={team}
            item={{ type: "inducement", inducement: entry.inducement }}
            onBuy={onBuy}
          />
        ))}
      </div>
    </Section>
  );
}

function StaffCounter({
  label,
  count,
  team,
  item,
  onBuy,
}: {
  label: string;
  count: number;
  team: Team;
  item: StaffItem;
  onBuy: (item: StaffItem) => void;
}) {
  const price = priceOf(team, item);
  const affordable = price.amount != null && team.treasury >= price.amount;

  return (
    <div className="flex flex-col gap-1">
      <span className="hud-label">
        {label}
        {price.amount != null && ` (${formatGold(price.amount)})`}
      </span>
      <div className="flex h-11 items-center justify-between rounded-hud border border-white/10 bg-black/35 pl-3 pr-1">
        <span className="font-hud-display text-hud-lg">{count}</span>
        <HudButton
          size="sm"
          variant="secondary"
          className="w-9 !px-0"
          onClick={() => {
            onBuy(item);
          }}
          disabled={!affordable}
          title={price.reason}
        >
          +
        </HudButton>
      </div>
    </div>
  );
}
