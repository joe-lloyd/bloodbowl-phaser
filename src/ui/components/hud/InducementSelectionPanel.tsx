import { ServiceContainer } from "../../../services/ServiceContainer";
import { Inducement } from "../../../types/Inducements";
import { NO_PURCHASE_LIMIT } from "../../../game/inducements/catalog";
import { DialogShell, HudButton, Notice } from "../componentWarehouse/HudKit";
import { usePregameCommand } from "./pregameInducementHooks";

const EFFECTS: Partial<Record<Inducement, string>> = {
  [Inducement.TEMP_AGENCY_CHEERLEADER]: "+1 to Cheering Fans.",
  [Inducement.PART_TIME_ASSISTANT_COACH]: "+1 to Brilliant Coaching.",
  [Inducement.BLITZERS_BEST_KEGS]: "+1 to KO recovery rolls per keg.",
  [Inducement.PRAYERS_TO_NUFFLE]:
    "Roll a random match-long blessing or dirty trick.",
  [Inducement.EXTRA_TEAM_TRAINING]:
    "An extra team re-roll each half (starting maximum 6).",
  [Inducement.BRIBE]:
    "On 2+, prevent a sending-off after Argue the Call fails.",
  [Inducement.WANDERING_APOTHECARY]:
    "One additional Apothecary use this match.",
  [Inducement.MORTUARY_ASSISTANT]: "Re-roll one failed Regeneration roll.",
  [Inducement.PLAGUE_DOCTOR]:
    "An additional Apothecary use or failed Regeneration re-roll.",
  [Inducement.HALFLING_MASTER_CHEF]:
    "Each half, roll three dice: each 4+ gains a re-roll and removes one from the opponent if available.",
  [Inducement.DESPERATE_MEASURES]:
    "Roll a random trick to use once this match.",
  [Inducement.MAGIC_POTION]:
    "Give it to a KO'd or hurt player after a drive, or a fit one before it. Roll a D8 to see what it does.",
  [Inducement.SOUVENIR]:
    "Roll a D8 for a trinket a player carries from the next drive until half time.",
  [Inducement.LESSER_MAGIC_POTION]:
    "Before a drive, give it to a fit or KO'd player and roll a D8.",
  [Inducement.SUPERIOR_MAGIC_POTION]:
    "Before a drive, give it to a fit or KO'd player for a lasting boost. A KO'd player recovers.",
  [Inducement.SAWBONES]:
    "Once per game, after a Casualty roll on your player, try for a better result.",
  [Inducement.SNACK_STAND]:
    "+1 to KO recovery; a used team re-roll comes back on a D6 of 6.",
  [Inducement.NOVICE_WIZARD]:
    "Once per game, at the end of your turn, Firebolt or Transmute an opposing player.",
};

export function InducementSelectionPanel({
  teamId,
  onChanged,
}: {
  teamId: string;
  onChanged: () => void;
}) {
  const service = ServiceContainer.getInstance().gameService;
  const team = service.getTeam(teamId)!;
  const offer = service.getInducementOffer();
  const catalog = offer.catalogs[teamId] ?? [];
  const selection = offer.selections[teamId] ?? [];
  const budget = offer.budgets[teamId] ?? 0;
  const spent = selection.reduce(
    (sum, line) =>
      sum +
      (catalog.find((entry) => entry.inducement === line.inducement)?.price ??
        0) *
        line.quantity,
    0
  );
  const { busy, error, run } = usePregameCommand(onChanged);
  const setQuantity = (inducement: Inducement, quantity: number) =>
    void run(() =>
      quantity === 0
        ? service.removeInducement(teamId, inducement)
        : service.selectInducement(teamId, inducement, quantity)
    );
  return (
    <DialogShell
      zClass="z-[100]"
      title={`Inducements — ${team.name}`}
      width="w-[600px]"
      placement="center"
      backdrop="heavy"
      className="max-h-[85dvh] overflow-y-auto hud-scroll"
      actions={
        <HudButton
          variant="primary"
          size="lg"
          block
          disabled={busy}
          onClick={() => void run(() => service.confirmInducements(teamId))}
        >
          {busy
            ? "Saving…"
            : spent > 0
              ? "Confirm inducements"
              : "Confirm — no purchases"}
        </HudButton>
      }
    >
      <p className="mb-2 text-hud-dim">
        Both teams are ready. Confirm your selection before the coin toss.
      </p>
      <p className="mb-4 font-hud-display text-hud-xl text-hud-gold">
        {(budget - spent).toLocaleString()} / {budget.toLocaleString()} gold
        remaining
      </p>
      {error && (
        <Notice tone="bad" role="alert" className="mb-3">
          {error}
        </Notice>
      )}
      <div className="space-y-2">
        {catalog.map((entry) => {
          const quantity =
            selection.find((line) => line.inducement === entry.inducement)
              ?.quantity ?? 0;
          return (
            <div
              key={entry.inducement}
              className="flex items-center justify-between gap-3 rounded-hud border border-white/10 bg-black/30 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="font-hud-label text-hud-lg font-bold text-hud-bone">
                  {entry.inducement}
                </div>
                <div className="text-hud-sm text-hud-dim">
                  {entry.price.toLocaleString()} gold each ·{" "}
                  {entry.maxCount >= NO_PURCHASE_LIMIT
                    ? "no limit"
                    : `max ${String(entry.maxCount)}`}
                </div>
                <p className="text-hud-sm text-hud-dim">
                  {EFFECTS[entry.inducement]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <HudButton
                  aria-label={`Remove ${entry.inducement}`}
                  size="sm"
                  className="!w-9 !px-0"
                  disabled={busy || quantity === 0}
                  onClick={() => {
                    setQuantity(entry.inducement, quantity - 1);
                  }}
                >
                  −
                </HudButton>
                <span
                  aria-label={`${entry.inducement} quantity`}
                  className="w-5 text-center font-hud-display text-hud-xl"
                >
                  {quantity}
                </span>
                <HudButton
                  aria-label={`Buy ${entry.inducement}`}
                  size="sm"
                  className="!w-9 !px-0"
                  disabled={
                    busy ||
                    quantity >= entry.maxCount ||
                    entry.price > budget - spent
                  }
                  onClick={() => {
                    setQuantity(entry.inducement, quantity + 1);
                  }}
                >
                  +
                </HudButton>
              </div>
            </div>
          );
        })}
      </div>
    </DialogShell>
  );
}
