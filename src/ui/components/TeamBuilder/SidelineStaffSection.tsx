import { Team } from "../../../types/Team";
import {
  StaffItem,
  draftInducementCount,
  priceOf,
} from "../../../game/rules/teamPricing";
import { sevensInducementCatalog } from "../../../game/inducements/catalog";
import { APOTHECARY_COST } from "../../../game/rules/sevensPrices";
import { HudButton, Section } from "../componentWarehouse/HudKit";
import { formatGold } from "../TeamManagement/TeamStatsOverview";

/** Re-rolls, the Apothecary, Dedicated Fans, coaches and cheerleaders. */
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
        <StaffCounter
          label="Dedicated Fans"
          count={team.dedicatedFans}
          team={team}
          item={{ type: "dedicated-fan" }}
          onBuy={onBuy}
        />
        <StaffCounter
          label="Asst. Coaches"
          count={team.coaches}
          team={team}
          item={{ type: "coach" }}
          onBuy={onBuy}
        />
        <StaffCounter
          label="Cheerleaders"
          count={team.cheerleaders}
          team={team}
          item={{ type: "cheerleader" }}
          onBuy={onBuy}
        />
      </div>
    </Section>
  );
}

/** Matched Play buys inducements from the draft budget (MP2). */
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
        {sevensInducementCatalog(team).map((entry) => (
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

/** A team asset bought one at a time, with its price and a "+" button. The
 *  price and any refusal come from priceOf, so a reached limit shows as a
 *  disabled button whose tooltip names it. */
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
  // The fullgame e2e driver finds a counter by this wrapper and its label.
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
          onClick={() => onBuy(item)}
          disabled={!affordable}
          title={price.reason}
        >
          +
        </HudButton>
      </div>
    </div>
  );
}
