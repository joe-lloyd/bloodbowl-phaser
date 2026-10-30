import { DecisionTeam } from "./DecisionTeam";
import React, { useState, useEffect, useRef } from "react";
import { EventBus } from "../../../services/EventBus";
import { blockPreviewLines } from "../../../game/rules/rollPreview";
import { BlockAnalysis } from "../../../types/Actions";
import {
  BlockResult,
  BlockRollData,
} from "../../../services/BlockResolutionService";
import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";

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

    eventBus.on(GameEventNames.TurnEnded, onRollCancelled);
    eventBus.on(GameEventNames.UI_BlockDialog, onOpen);
    eventBus.on(GameEventNames.BlockDiceRolled, onDiceRolled);
    eventBus.on(GameEventNames.BlockDiceKept, onDiceRolled);
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
      eventBus.off(GameEventNames.TurnEnded, onRollCancelled);
      eventBus.off(GameEventNames.UI_BlockDialog, onOpen);
      eventBus.off(GameEventNames.BlockDiceRolled, onDiceRolled);
      eventBus.off(GameEventNames.BlockDiceKept, onDiceRolled);
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
  const { attackerST, defenderST } = analysis;
  const diceCount = rollData?.numDice ?? analysis.diceCount;
  const isUphill = rollData ? !rollData.isAttackerChoice : analysis.isUphill;

  const canAct = !chosen && getActiveOnlineMatch()?.mayAct() !== false;
  const rerollFirst = rollData?.choiceStage === "attacker-reroll";
  const service = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService
    : null;
  const attackingTeamId = service?.getPlayerById(data.attackerId)?.teamId;
  const attackingTeam = attackingTeamId
    ? service?.getTeam(attackingTeamId)
    : null;
  const attacker = service?.getPlayerById(data.attackerId);
  const defender = service?.getPlayerById(data.defenderId);
  const previewLines =
    attacker && defender ? blockPreviewLines(analysis, attacker, defender) : [];

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
    else if (!rerollFirst) handleSelectResult(result);
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
    <DialogShell
      placement="dock"
      eyebrow={
        <DecisionTeam
          playerId={
            isUphill && rollData && !rerollFirst
              ? data.defenderId
              : data.attackerId
          }
          pick={isUphill && !!rollData && !rerollFirst}
        />
      }
      testId="block-dice-dialog"
      tone="blood"
      title="BLOCK!"
      width="w-[304px]"
      className="absolute right-4 top-[100px] max-h-[calc(100%_-_116px)] overflow-y-auto !px-3 !py-3"
      actions={
        // Once the dice are rolled the block CANNOT be cancelled: a result
        // must be picked
        !rollData &&
        canAct && (
          <div className="flex items-center justify-between gap-3">
            {!rollData && !isRolling && !heldDice ? (
              <HudButton variant="ghost" onClick={handleCancel}>
                Cancel
              </HudButton>
            ) : (
              <span />
            )}
            <HudButton
              data-testid="block-roll-dice"
              variant="primary"
              size="lg"
              onClick={handleRoll}
              disabled={isRolling}
            >
              ROLL DICE
            </HudButton>
          </div>
        )
      }
    >
      {/* Strength comparison */}
      <div className="flex items-stretch gap-2">
        <div className="flex flex-1 flex-col items-center rounded-hud border border-hud-good/30 bg-black/35 py-1.5">
          <span className="hud-label">ATTACKER</span>
          <span className="font-hud-display text-hud-2xl text-hud-good">
            {attackerST}
          </span>
        </div>
        <div className="flex items-center px-1 font-hud-display text-hud-xl text-hud-gold">
          VS
        </div>
        <div className="flex flex-1 flex-col items-center rounded-hud border border-hud-bad/30 bg-black/35 py-1.5">
          <span className="hud-label">DEFENDER</span>
          <span className="font-hud-display text-hud-2xl text-hud-bad">
            {defenderST}
          </span>
        </div>
      </div>

      <div data-testid="block-roll-analysis" className="mt-2 font-hud-body text-hud-xs leading-snug">
        {previewLines.map((line, index) => <div key={index} className={index === 0 && isUphill ? "text-hud-bad font-bold" : line.startsWith("Our assists") ? "text-hud-good" : line.startsWith("Their assists") ? "text-hud-bad" : ""}>{line}</div>)}
      </div>

      {/* Dice count and who picks */}
      <div className="mt-3 flex items-center justify-center gap-3">
        <div className="font-hud-label text-hud-xl font-bold uppercase tracking-[0.06em] text-hud-bone">
          {diceCount} DICE{" "}
          {isUphill ? <span className="text-hud-bad">(UPHILL)</span> : ""}
        </div>
        <div className="hud-label">
          {isUphill ? "Defender Chooses" : "Attacker Chooses"}
        </div>
      </div>

      {/* The dice themselves are in the dice tray below: a click on a
          lifted die chooses it. These buttons keep the choice open to a
          keyboard or a screen reader. */}
      {rollData ? (
        <div className="mt-3">
          {canAct && rerollFirst && (
            <HudButton
              data-testid="block-keep-dice"
              block
              onClick={() =>
                eventBus.emit(GameEventNames.UI_KeepBlockDice, {
                  attackerId: data.attackerId,
                })
              }
            >
              Keep dice
            </HudButton>
          )}
          <div className="flex justify-center gap-2">
            {canAct &&
              (!rerollFirst || proMode) &&
              rollData.results.map((result, idx) => (
                <button
                  key={idx}
                  data-testid={`block-die-${idx}`}
                  data-block-result={result.type}
                  onClick={() => pickRef.current?.(idx)}
                  // Hidden until a keyboard focuses it, then a plain button
                  className="sr-only focus:not-sr-only focus:rounded-hud focus:border focus:border-hud-gold focus:bg-hud-raise focus:px-3 focus:py-1 focus:font-hud-label focus:text-hud-sm focus:font-bold focus:text-hud-bone"
                >
                  {proMode ? `Re-roll ${result.label}` : result.label}
                </button>
              ))}
          </div>
          <div className="rounded-hud border border-hud-gold/30 bg-hud-gold/10 px-3 py-2 text-center font-hud-label text-hud-base font-semibold text-hud-gold">
            {chosen
              ? `Chosen: ${chosen.replace(/-/g, " ").toUpperCase()}`
              : proMode
                ? "Pro: click a die in the tray to re-roll it (3+)"
                : getActiveOnlineMatch()?.mayAct() === false
                  ? "The other coach is choosing…"
                  : rerollFirst
                    ? `${attackingTeam?.name ?? "Attacking team"}: re-roll first?`
                    : "Click a die in the tray to choose the result"}
          </div>
          {canAct &&
            (rollData.teamRerollAvailable ||
              rollData.proAvailable ||
              rollData.brawlerAvailable ||
              rollData.veteranRerollAvailable) && (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {rollData.teamRerollAvailable && (
                  <HudButton
                    data-testid="block-team-reroll"
                    size="sm"
                    onClick={handleTeamReroll}
                  >
                    TEAM RE-ROLL (all dice)
                  </HudButton>
                )}
                {rollData.proAvailable && (
                  <HudButton
                    size="sm"
                    variant={proMode ? "gold" : "secondary"}
                    onClick={() => setProMode((m) => !m)}
                  >
                    {proMode ? "PICK A DIE…" : "USE PRO (re-roll one die)"}
                  </HudButton>
                )}
                {rollData.brawlerAvailable && (
                  <HudButton
                    data-testid="block-brawler-reroll"
                    size="sm"
                    onClick={handleBrawlerReroll}
                  >
                    BRAWLER: RE-ROLL 1 BOTH DOWN
                  </HudButton>
                )}
                {rollData.veteranRerollAvailable && (
                  <HudButton
                    data-testid="block-veteran-reroll"
                    size="sm"
                    onClick={handleVeteranReroll}
                  >
                    VETERAN RE-ROLL (all dice, once per game)
                  </HudButton>
                )}
              </div>
            )}
        </div>
      ) : isRolling ? (
        <div className="mt-4 text-center font-hud-label text-hud-base uppercase tracking-[0.1em] text-hud-dim">
          Rolling…
        </div>
      ) : null}
    </DialogShell>
  );
};
