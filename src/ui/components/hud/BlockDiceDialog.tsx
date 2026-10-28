import React, { useState, useEffect, useRef } from "react";
import { EventBus } from "../../../services/EventBus";
import { BlockAnalysis } from "../../../types/Actions";
import {
  BlockResult,
  BlockRollData,
} from "../../../services/BlockResolutionService";
import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";

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
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  // Online: the face the chooser picked, shown briefly on both screens
  const [chosen, setChosen] = useState<string | null>(null);

  const [isRolling, setIsRolling] = useState(false);
  const [rollData, setRollData] = useState<BlockRollData | null>(null);
  // The dice are thrown and lifted in the dice tray; a click on a lifted
  // die there arrives here as UI_BlockDieClicked
  const pickRef = useRef<((index: number) => void) | null>(null);
  useEffect(() => {
    const onPick = ({ index }: { index: number }) => pickRef.current?.(index);
    eventBus.on(GameEventNames.UI_BlockDieClicked, onPick);
    return () => eventBus.off(GameEventNames.UI_BlockDieClicked, onPick);
  }, [eventBus]);
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
      setChosen(null);
      // Online, both coaches see every block's dice. A screen that did not
      // open this block (the other coach's, or an uphill defender's) asks
      // its own engine for the block's numbers and shows the dice at once.
      const online = getActiveOnlineMatch();
      const current = dataRef.current;
      const sameBlock =
        current?.attackerId === payload.attackerId &&
        current?.defenderId === payload.defenderId;
      if (online && !openRef.current && (!online.mayAct() || !sameBlock)) {
        ServiceContainer.getInstance().gameService.previewBlock(
          payload.attackerId,
          payload.defenderId
        );
        setRollData(payload);
        return;
      }
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
    // Online: this engine refused the block (the board had moved on)
    const onRejected = ({ commandType }: { commandType: string }) => {
      if (commandType === "block" || commandType === "multiple-block")
        onRollCancelled();
    };
    eventBus.on(GameEventNames.NetworkCommandRejected, onRejected);
    // The other coach may be the one who picks the result
    const onResolved = ({
      type,
      result,
    }: {
      type: string;
      result?: string;
    }) => {
      if (type !== "block-dice") return;
      // Online, hold the chosen face up for a moment on both screens
      if (getActiveOnlineMatch() && result) {
        setIsOpen(true);
        setChosen(result);
        setTimeout(() => {
          setChosen(null);
          onRollCancelled();
        }, 1500);
        return;
      }
      onRollCancelled();
    };
    eventBus.on(GameEventNames.DecisionResolved, onResolved);

    return () => {
      eventBus.off(GameEventNames.UI_BlockDialog, onOpen);
      eventBus.off(GameEventNames.BlockDiceRolled, onDiceRolled);
      eventBus.off(GameEventNames.UI_BlockRollCancelled, onRollCancelled);
      eventBus.off(GameEventNames.NetworkCommandRejected, onRejected);
      eventBus.off(GameEventNames.DecisionResolved, onResolved);
    };
  }, [eventBus]);

  if (!isOpen || !data) {
    pickRef.current = null;
    return null;
  }

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

  pickRef.current = (index: number) => {
    const result = rollData?.results[index];
    if (!result) return;
    if (proMode) handleProReroll(index);
    else handleSelectResult(result);
  };

  const handleBrawlerReroll = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (!data) return;
    eventBus.emit(GameEventNames.UI_BrawlerRerollBlockDie, {
      attackerId: data.attackerId,
    });
  };

  const handleVeteranReroll = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (!data) return;
    eventBus.emit(GameEventNames.UI_VeteranRerollBlock, {
      attackerId: data.attackerId,
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

        {/* The dice themselves are in the dice tray below: a click on a
            lifted die chooses it. These buttons keep the choice open to a
            keyboard or a screen reader. */}
        {rollData ? (
          <div className="mb-6">
            <div className="sr-only">
              {rollData.results.map((result, idx) => (
                <button
                  key={idx}
                  data-testid={`block-die-${idx}`}
                  data-block-result={result.type}
                  onClick={() => pickRef.current?.(idx)}
                >
                  {proMode ? `Re-roll ${result.label}` : result.label}
                </button>
              ))}
            </div>
            <div className="text-center text-sm text-yellow-400">
              {chosen
                ? `Chosen: ${chosen.replace(/-/g, " ").toUpperCase()}`
                : proMode
                  ? "Pro: click a die in the tray to re-roll it (3+)"
                  : getActiveOnlineMatch()?.mayAct() === false
                    ? "The other coach is choosing…"
                    : "Click a die in the tray to choose the result"}
            </div>
            {(rollData.teamRerollAvailable ||
              rollData.proAvailable ||
              rollData.brawlerAvailable ||
              rollData.veteranRerollAvailable) && (
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
                {rollData.brawlerAvailable && (
                  <button
                    data-testid="block-brawler-reroll"
                    onClick={handleBrawlerReroll}
                    className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 rounded text-xs font-bold text-white transition-colors"
                  >
                    BRAWLER: RE-ROLL 1 BOTH DOWN
                  </button>
                )}
                {rollData.veteranRerollAvailable && (
                  <button
                    data-testid="block-veteran-reroll"
                    onClick={handleVeteranReroll}
                    className="px-3 py-1.5 bg-teal-700 hover:bg-teal-600 rounded text-xs font-bold text-white transition-colors"
                  >
                    VETERAN RE-ROLL (all dice, once per game)
                  </button>
                )}
              </div>
            )}
          </div>
        ) : isRolling ? (
          <div className="mb-6 text-center text-sm text-slate-400 italic">
            Rolling…
          </div>
        ) : null}

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
