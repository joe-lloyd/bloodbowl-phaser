import React, { useMemo, useState } from "react";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { Inducement } from "../../../types/Inducements";

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
  const qtyOf = (inducement: Inducement) =>
    selection.find((line) => line.inducement === inducement)?.quantity ?? 0;

  const spend = selection.reduce((sum, line) => {
    const entry = offer.profile.catalog.find(
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
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 pointer-events-auto">
      <div className="bg-slate-900 border-2 border-yellow-500 rounded-lg p-6 w-[520px] text-white shadow-2xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-2xl font-black text-center text-yellow-400 mb-2 uppercase tracking-wider">
          Inducements — {activeTeam.name}
        </h2>
        <p className="text-center text-slate-300 mb-4">
          Petty Cash: {(budget - spend).toLocaleString()} /{" "}
          {budget.toLocaleString()} gold remaining
        </p>

        <div className="flex flex-col gap-3 mb-6">
          {offer.profile.catalog.map((entry) => {
            const qty = qtyOf(entry.inducement);
            return (
              <div
                key={entry.inducement}
                className="flex items-center justify-between bg-slate-800 rounded px-4 py-2"
              >
                <div>
                  <div className="font-semibold">{entry.inducement}</div>
                  <div className="text-xs text-slate-400">
                    {entry.price.toLocaleString()} gold each · max{" "}
                    {entry.maxCount}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600"
                    onClick={() => setQuantity(entry.inducement, qty - 1)}
                    disabled={qty <= 0}
                  >
                    −
                  </button>
                  <span className="w-6 text-center">{qty}</span>
                  <button
                    className="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600"
                    onClick={() => setQuantity(entry.inducement, qty + 1)}
                    disabled={qty >= entry.maxCount}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
          {budget === 0 && (
            <p className="text-center text-slate-500 text-sm">
              No petty cash this match — team values are level (or this team
              has the higher value).
            </p>
          )}
        </div>

        <div className="flex justify-center">
          <button
            onClick={confirmAndAdvance}
            className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            {turnIndex + 1 < teams.length
              ? `CONFIRM — NEXT: ${container.gameService.getTeam(teams[turnIndex + 1])?.name}`
              : "CONFIRM AND START MATCH"}
          </button>
        </div>
      </div>
    </div>
  );
};
