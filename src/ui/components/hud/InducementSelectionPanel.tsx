import React, { useMemo, useState } from "react";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { Inducement } from "../../../types/Inducements";
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";

interface InducementSelectionPanelProps {
  /** Called once both teams have confirmed and the inventory is committed. */
  onDone: () => void;
}

/**
 * The pre-match inducement selection and confirmation flow (tasks.md 2.4):
 * one authoritative budget/catalog per match, each coach spends their petty
 * cash in turn, and confirming both locks the selection into match state.
 *
 * Routes every mutation through IGameService.selectInducement /
 * removeInducement / confirmInducements — the exact same authoritative
 * session GameService holds for the headless protocol and, over the
 * network, for the online host (see GameService.getOrCreateInducementSession
 * and NetworkedGameService, which sends these as protocol commands for the
 * guest instead of mutating a local copy). Local hotseat play walks both
 * coaches through this same panel in one browser tab, team1 first.
 */
export const InducementSelectionPanel: React.FC<
  InducementSelectionPanelProps
> = ({ onDone }) => {
  const container = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance()
    : null;
  const teams = useMemo(() => {
    if (!container) return null;
    const state = container.gameService.getState();
    const ids = Object.keys(state.score);
    if (ids.length !== 2) return null;
    return ids as [string, string];
  }, [container]);

  const [turnIndex, setTurnIndex] = useState(0);
  const [, forceRender] = useState(0);

  if (!container || !teams) return null;

  const activeTeamId = teams[turnIndex];
  const activeTeam = container.gameService.getTeam(activeTeamId)!;
  const offer = container.gameService.getInducementOffer();
  const budget = offer.budgets[activeTeamId] ?? 0;
  const selection = offer.selections[activeTeamId] ?? [];
  const catalog = offer.catalogs[activeTeamId] ?? [];
  const qtyOf = (inducement: Inducement) =>
    selection.find((line) => line.inducement === inducement)?.quantity ?? 0;

  const spend = selection.reduce((sum, line) => {
    const entry = catalog.find(
      (c) => c.inducement === line.inducement
    );
    return sum + (entry ? entry.price * line.quantity : 0);
  }, 0);

  const setQuantity = (inducement: Inducement, quantity: number) => {
    const clamped = Math.max(0, quantity);
    const result =
      clamped === 0
        ? container.gameService.removeInducement(activeTeamId, inducement)
        : container.gameService.selectInducement(
            activeTeamId,
            inducement,
            clamped
          );
    if (!result.ok) {
      console.warn("[Inducements] selection rejected:", result.errors);
    }
    forceRender((n) => n + 1);
  };

  const confirmAndAdvance = () => {
    const result = container.gameService.confirmInducements(activeTeamId);
    if (!result.ok) {
      console.warn("[Inducements] confirm rejected:", result.errors);
      return;
    }
    if (turnIndex + 1 < teams.length) {
      setTurnIndex(turnIndex + 1);
      return;
    }
    onDone();
  };

  return (
    <DialogShell
      title={<>Inducements — {activeTeam.name}</>}
      width="w-[520px]"
      placement="center"
      backdrop="heavy"
      className="max-h-[80vh] overflow-y-auto hud-scroll"
      actions={
        <HudButton variant="gold" size="lg" block onClick={confirmAndAdvance}>
          {turnIndex + 1 < teams.length
            ? `CONFIRM — NEXT: ${container.gameService.getTeam(teams[turnIndex + 1])?.name}`
            : "CONFIRM AND START MATCH"}
        </HudButton>
      }
    >
      <p className="mb-4 flex items-baseline gap-2">
        <span className="hud-label">Petty Cash:</span>
        <span className="font-hud-display text-hud-xl text-hud-gold">
          {(budget - spend).toLocaleString()}
        </span>
        <span className="text-hud-dim">
          / {budget.toLocaleString()} gold remaining
        </span>
      </p>

      <div className="flex flex-col gap-2">
        {catalog.map((entry) => {
          const qty = qtyOf(entry.inducement);
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
                  {entry.price.toLocaleString()} gold each · max{" "}
                  {entry.maxCount}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <HudButton
                  size="sm"
                  className="!w-9 !px-0"
                  onClick={() => setQuantity(entry.inducement, qty - 1)}
                  disabled={qty <= 0}
                >
                  −
                </HudButton>
                <span className="w-6 text-center font-hud-display text-hud-xl">
                  {qty}
                </span>
                <HudButton
                  size="sm"
                  className="!w-9 !px-0"
                  onClick={() => setQuantity(entry.inducement, qty + 1)}
                  disabled={qty >= entry.maxCount}
                >
                  +
                </HudButton>
              </div>
            </div>
          );
        })}
        {budget === 0 && (
          <p className="text-center text-hud-sm text-hud-mute">
            No petty cash this match — team values are level (or this team
            has the higher value).
          </p>
        )}
      </div>
    </DialogShell>
  );
};
