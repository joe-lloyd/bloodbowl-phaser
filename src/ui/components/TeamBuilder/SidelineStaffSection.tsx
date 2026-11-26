import { type Team } from "../../../types/Team";
import {
  type PriceResult,
  type StaffItem,
  draftInducementCount,
  priceOf,
  refundOf,
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
  onRefund,
  onApothecaryToggle,
}: {
  team: Team;
  active: boolean;
  onBuy: (item: StaffItem) => void;
  onRefund: (item: StaffItem) => void;
  onApothecaryToggle: () => void;
}) {
  const apothecaryPrice = priceOf(team, { type: "apothecary" });
  const draft = teamDraftRules(team);
  const refundable = active ? undefined : onRefund;
  return (
    <Section title="Sideline staff" aside={`Gold ${formatGold(team.treasury)}`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StaffCounter
          label="Re-Rolls"
          count={team.rerolls}
          team={team}
          item={{ type: "reroll" }}
          locked={active}
          onBuy={onBuy}
          onRefund={refundable}
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
          locked={active}
          onBuy={onBuy}
          onRefund={refundable}
        />
        {draft.assistantCoaches && (
          <StaffCounter
            label="Asst. Coaches"
            count={team.coaches}
            team={team}
            item={{ type: "coach" }}
            onBuy={onBuy}
            onRefund={refundable}
          />
        )}
        {draft.cheerleaders && (
          <StaffCounter
            label="Cheerleaders"
            count={team.cheerleaders}
            team={team}
            item={{ type: "cheerleader" }}
            onBuy={onBuy}
            onRefund={refundable}
          />
        )}
      </div>
    </Section>
  );
}

export function DraftInducementsSection({
  team,
  onBuy,
  onRefund,
}: {
  team: Team;
  onBuy: (item: StaffItem) => void;
  onRefund: (item: StaffItem) => void;
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
            onRefund={onRefund}
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
  locked = false,
  onBuy,
  onRefund,
}: {
  label: string;
  count: number;
  team: Team;
  item: StaffItem;
  locked?: boolean;
  onBuy: (item: StaffItem) => void;
  onRefund?: ((item: StaffItem) => void) | undefined;
}) {
  const price = priceOf(team, item);
  const affordable = price.amount != null && team.treasury >= price.amount;
  const refundPrice = refundOf(team, item);

  return (
    <div className="flex flex-col gap-1">
      <span className="hud-label">
        {label}
        {price.amount != null && ` (${formatGold(price.amount)})`}
      </span>
      <div className="flex h-11 items-center justify-between rounded-hud border border-white/10 bg-black/35 pl-3 pr-1">
        <span className="font-hud-display text-hud-lg">{count}</span>
        <span className="flex gap-1">
          {onRefund && (
            <CounterButton
              sign="−"
              label={`Remove one ${label}`}
              price={refundPrice}
              enabled={refundPrice.amount != null}
              onClick={() => {
                onRefund(item);
              }}
            />
          )}
          {!locked && (
            <CounterButton
              sign="+"
              label={`Add one ${label}`}
              price={price}
              enabled={affordable}
              onClick={() => {
                onBuy(item);
              }}
            />
          )}
        </span>
      </div>
    </div>
  );
}

function CounterButton({
  sign,
  label,
  price,
  enabled,
  onClick,
}: {
  sign: string;
  label: string;
  price: PriceResult;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <HudButton
      size="sm"
      variant="secondary"
      className="w-9 !px-0"
      onClick={onClick}
      disabled={!enabled}
      title={price.reason}
      aria-label={label}
    >
      {sign}
    </HudButton>
  );
}
