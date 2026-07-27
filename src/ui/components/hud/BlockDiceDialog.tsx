import React, { useState, useEffect, useRef } from "react";
import { EventBus } from "../../../services/EventBus";
import { BlockAnalysis } from "../../../types/Actions";
import {
  BlockResult,
  BlockRollData,
} from "../../../services/BlockResolutionService";
import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";

interface BlockDiceDialogProps {
  eventBus: EventBus;
}

export const BlockDiceDialog: React.FC<BlockDiceDialogProps> = ({
  eventBus,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // Mirror isOpen into a ref so the (once-registered) event handlers can tell a
  // normal block (dialog already open, coach clicked Roll) from a forced/auto
  // block (dialog closed) without a stale closure.
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = isOpen;
  }, [isOpen]);

  const [data, setData] = useState<{
    attackerId: string;
    defenderId: string;
    analysis: BlockAnalysis;
  } | null>(null);

  const [isRolling, setIsRolling] = useState(false);
  const [rollData, setRollData] = useState<BlockRollData | null>(null);
  // A forced block (Frenzy's second Block) arrives already rolled; hold its
  // dice behind a ROLL button so the coach still triggers the reveal.
  const [heldDice, setHeldDice] = useState<BlockRollData | null>(null);
  // Pro mode: the next die the coach clicks is re-rolled (not selected).
  const [proMode, setProMode] = useState(false);

  useEffect(() => {
    const onOpen = (payload: {
      attackerId: string;
      defenderId: string;
      analysis: BlockAnalysis;
    }) => {
      setData(payload);
      setRollData(null);
      setHeldDice(null);
      setIsRolling(false);
      setProMode(false);
      setIsOpen(true);
    };

    const onDiceRolled = (payload: BlockRollData) => {
      setIsRolling(false);
      setProMode(false);
      if (openRef.current) {
        // Normal block: the coach already clicked Roll — show the dice.
        setRollData(payload);
      } else {
        // Forced/auto block (Frenzy's mandatory second Block): the window was
        // closed when the first result was picked. Re-open it onto a ROLL
        // button that reveals the already-rolled dice, so it still feels like
        // the coach triggers it. The retained `data` is the same
        // attacker/defender, so its stats panel still applies.
        setHeldDice(payload);
        setRollData(null);
        setIsOpen(true);
      }
    };

    // The roll will not happen (illegal block, no movement left, rush
    // declined or failed): close instead of spinning forever
    const onRollCancelled = () => {
      setIsOpen(false);
      setIsRolling(false);
      setRollData(null);
      setHeldDice(null);
    };

    eventBus.on(GameEventNames.UI_BlockDialog, onOpen);
    eventBus.on(GameEventNames.BlockDiceRolled, onDiceRolled);
    eventBus.on(GameEventNames.UI_BlockRollCancelled, onRollCancelled);

    return () => {
      eventBus.off(GameEventNames.UI_BlockDialog, onOpen);
      eventBus.off(GameEventNames.BlockDiceRolled, onDiceRolled);
      eventBus.off(GameEventNames.UI_BlockRollCancelled, onRollCancelled);
    };
  }, [eventBus]);

  if (!isOpen || !data) return null;

  const { analysis } = data;
  const { diceCount, isUphill, attackerST, defenderST } = analysis;

  const handleRoll = () => {
    // Online: only the coach who owns the action/decision may interact
    if (getActiveOnlineMatch()?.mayAct() === false) return;

    // A forced block already has its dice — the ROLL button just reveals them.
    if (heldDice) {
      setRollData(heldDice);
      setHeldDice(null);
      return;
    }

    setIsRolling(true);

    // Emit event to roll dice (GameService will handle it)
    eventBus.emit(GameEventNames.UI_RollBlockDice, {
      attackerId: data.attackerId,
      defenderId: data.defenderId,
      numDice: diceCount,
      isAttackerChoice: !isUphill,
    });
  };

  const handleSelectResult = (result: BlockResult) => {
    // Online: an uphill block's die belongs to the defender
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    // Emit result to GameService
    eventBus.emit(GameEventNames.UI_BlockResultSelected, {
      attackerId: data.attackerId,
      defenderId: data.defenderId,
      result,
    });

    setIsOpen(false);
    setHeldDice(null);
  };

  const handleTeamReroll = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (!data) return;
    eventBus.emit(GameEventNames.UI_TeamRerollBlock, {
      attackerId: data.attackerId,
    });
  };

  const handleProReroll = (dieIndex: number) => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (!data) return;
    setProMode(false);
    eventBus.emit(GameEventNames.UI_ProRerollBlockDie, {
      attackerId: data.attackerId,
      dieIndex,
    });
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  return (
    <div
      data-testid="block-dice-dialog"
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-auto"
    >
      <div className="bg-slate-900 border-2 border-yellow-500 rounded-lg p-6 w-[500px] text-white shadow-2xl">
        <h2 className="text-3xl font-black text-center text-yellow-400 mb-4 uppercase tracking-wider glow-text">
          BLOCK!
        </h2>

        {/* Stats Comparison */}
        <div className="flex justify-between items-center mb-6 bg-slate-800 p-3 rounded">
          <div className="text-center">
            <div className="text-xs text-slate-400">ATTACKER</div>
            <div className="text-2xl font-bold text-green-400">
              {attackerST}
            </div>
          </div>
          <div className="text-yellow-600 font-bold text-xl">VS</div>
          <div className="text-center">
            <div className="text-xs text-slate-400">DEFENDER</div>
            <div className="text-2xl font-bold text-red-400">{defenderST}</div>
          </div>
        </div>

        {/* Dice Info */}
        <div className="text-center mb-6">
          <div className="text-lg font-bold">
            {diceCount} DICE{" "}
            {isUphill ? <span className="text-red-500">(UPHILL)</span> : ""}
          </div>
          <div className="text-sm text-slate-400 italic">
            {isUphill ? "Defender Chooses" : "Attacker Chooses"}
          </div>
        </div>

        {/* Dice Results Area */}
        {rollData ? (
          <div className="mb-6">
            <div className="flex justify-center gap-4 mb-4">
              {rollData.results.map((result, idx) => (
                <button
                  key={idx}
                  data-testid={`block-die-${idx}`}
                  data-block-result={result.type}
                  onClick={() =>
                    proMode ? handleProReroll(idx) : handleSelectResult(result)
                  }
                  className={`group relative hover:scale-110 transition-transform ${proMode ? "ring-2 ring-purple-400 rounded" : ""}`}
                  title={proMode ? `Re-roll this ${result.label}` : result.label}
                >
                  <img
                    src={result.icon}
                    alt={result.label}
                    className="w-20 h-20 rounded shadow-lg border-2 border-slate-400 group-hover:border-yellow-400 transition-colors"
                  />
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    {result.label}
                  </div>
                </button>
              ))}
            </div>
            <div className="text-center text-sm text-yellow-400 mt-8">
              {proMode
                ? "Pro: click a die to re-roll it (3+)"
                : "Click a die to select the result"}
            </div>
            {(rollData.teamRerollAvailable || rollData.proAvailable) && (
              <div className="flex justify-center gap-3 mt-3">
                {rollData.teamRerollAvailable && (
                  <button
                    data-testid="block-team-reroll"
                    onClick={handleTeamReroll}
                    className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded text-xs font-bold text-white transition-colors"
                  >
                    TEAM RE-ROLL (all dice)
                  </button>
                )}
                {rollData.proAvailable && (
                  <button
                    onClick={() => setProMode((m) => !m)}
                    className={`px-3 py-1.5 rounded text-xs font-bold text-white transition-colors ${
                      proMode
                        ? "bg-purple-500"
                        : "bg-purple-700 hover:bg-purple-600"
                    }`}
                  >
                    {proMode ? "PICK A DIE…" : "USE PRO (re-roll one die)"}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-center mb-6 h-20 items-center">
            {isRolling ? (
              <div className="flex gap-2">
                {Array.from({ length: diceCount }).map((_, i) => (
                  <div
                    key={i}
                    className="w-16 h-16 bg-slate-700 rounded border border-yellow-500 animate-spin"
                    style={{
                      animationDelay: `${i * 100}ms`,
                      animationDuration: "600ms",
                    }}
                  >
                    <div className="w-full h-full flex items-center justify-center text-yellow-400 font-bold">
                      ?
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-2 opacity-50">
                {Array.from({ length: diceCount }).map((_, i) => (
                  <div
                    key={i}
                    className="w-16 h-16 bg-slate-700/50 rounded border border-slate-600"
                  ></div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions — once the dice are rolled the block CANNOT be cancelled:
            a result must be picked */}
        <div className="flex justify-between">
          {!rollData && !isRolling && !heldDice ? (
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300 transition-colors"
            >
              Cancel
            </button>
          ) : (
            <span />
          )}
          {!rollData && (
            <button
              data-testid="block-roll-dice"
              onClick={handleRoll}
              disabled={isRolling}
              className="px-8 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ROLL DICE
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
