import { useAfterDice } from "../../hooks/useAfterDice";
import { DecisionTeam } from "./DecisionTeam";
import React, { useState, useEffect, useRef } from "react";
import { EventBus } from "../../../services/EventBus";
import { blockPreviewLines, BlockSide } from "../../../game/rules/rollPreview";
import { BlockAnalysis } from "../../../types/Actions";
import type { Player } from "../../../types/Player";
import {
  BlockResult,
  BlockRollData,
} from "../../../services/BlockResolutionService";
import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";
import { useHotkey } from "../../hotkeys";

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
      }
      // Mandatory blocks roll automatically. Open directly onto their dice;
      // useAfterDice waits for them to land before allowing a selection.
      setRollData(payload);
      setIsOpen(true);
    };

    // The roll will not happen (illegal block, no movement left, rush
    // declined or failed): close instead of spinning forever
    const onRollCancelled = () => {
      setIsOpen(false);
      setIsRolling(false);
      setRollData(null);
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

  // The choices name the faces: hold them until the block dice have landed
  const shownRoll = useAfterDice(eventBus, rollData);

  if (!isOpen || !data) {
    pickRef.current = null;
    return null;
  }

  const { analysis } = data;
  const { attackerST, defenderST } = analysis;
  const { diceCount, isUphill } = diceAndPicker(analysis, rollData);

  const canAct = !chosen && getActiveOnlineMatch()?.mayAct() !== false;
  const rerollFirst = rollData?.choiceStage === "attacker-reroll";
  const { attacker, defender, attackingTeamName } = blockSides(data);

  const handleRoll = () => {
    // Online: only the coach who owns the action/decision may interact
    if (getActiveOnlineMatch()?.mayAct() === false) return;

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
    const result = shownRoll?.results[index];
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

  // An uphill block's result is the defender's pick
  const defenderPicks = isUphill && !!rollData && !rerollFirst;
  return (
    <DialogShell
      placement="dock"
      eyebrow={
        <DecisionTeam
          playerId={defenderPicks ? data.defenderId : data.attackerId}
          pick={defenderPicks}
        />
      }
      testId="block-dice-dialog"
      tone="blood"
      title="BLOCK!"
      width="w-[480px]"
      actions={
        // Once the dice are rolled the block CANNOT be cancelled: a result
        // must be picked
        !rollData &&
        canAct && (
          <RollActions
            showCancel={!isRolling}
            isRolling={isRolling}
            onCancel={handleCancel}
            onRoll={handleRoll}
          />
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

      <BlockPreview
        analysis={analysis}
        attacker={attacker}
        defender={defender}
        isUphill={isUphill}
      />

      {/* Dice count and who picks */}
      <DiceCount diceCount={diceCount} isUphill={isUphill} />

      {/* The dice themselves are in the dice tray below: a click on a
          lifted die chooses it. These buttons keep the choice open to a
          keyboard or a screen reader. */}
      {shownRoll ? (
        <BlockChoices
          roll={shownRoll}
          canAct={canAct}
          rerollFirst={rerollFirst}
          proMode={proMode}
          chosen={chosen}
          attackingTeamName={attackingTeamName}
          onKeep={() =>
            eventBus.emit(GameEventNames.UI_KeepBlockDice, {
              attackerId: data.attackerId,
            })
          }
          onPick={(index) => pickRef.current?.(index)}
        >
          <BlockRerolls
            roll={shownRoll}
            proMode={proMode}
            onTeamReroll={handleTeamReroll}
            onTogglePro={() => setProMode((m) => !m)}
            onBrawlerReroll={handleBrawlerReroll}
            onVeteranReroll={handleVeteranReroll}
          />
        </BlockChoices>
      ) : isRolling || rollData ? (
        <div className="mt-4 text-center font-hud-label text-hud-base uppercase tracking-[0.1em] text-hud-dim">
          Rolling…
        </div>
      ) : null}
    </DialogShell>
  );
};

/** The players and the attacking team in a block, when the game is up. */
function blockSides({
  attackerId,
  defenderId,
}: {
  attackerId: string;
  defenderId: string;
}) {
  if (!ServiceContainer.isInitialized())
    return {
      attacker: undefined,
      defender: undefined,
      attackingTeamName: undefined,
    };
  const service = ServiceContainer.getInstance().gameService;
  const attacker = service.getPlayerById(attackerId);
  const defender = service.getPlayerById(defenderId);
  const attackingTeamId = attacker?.teamId;
  return {
    attacker,
    defender,
    attackingTeamName: attackingTeamId
      ? service.getTeam(attackingTeamId)?.name
      : undefined,
  };
}

/** The dice and who picks: the roll's own once thrown, else the analysis'. */
function diceAndPicker(
  analysis: BlockAnalysis,
  rollData: BlockRollData | null
): { diceCount: number; isUphill: boolean } {
  if (!rollData)
    return { diceCount: analysis.diceCount, isUphill: analysis.isUphill };
  return { diceCount: rollData.numDice, isUphill: !rollData.isAttackerChoice };
}

/** Cancel, while nothing is rolling, beside the roll button. */
function RollActions({
  showCancel,
  isRolling,
  onCancel,
  onRoll,
}: {
  showCancel: boolean;
  isRolling: boolean;
  onCancel: () => void;
  onRoll: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      {showCancel ? (
        <HudButton variant="ghost" hotkey="Escape" onClick={onCancel}>
          Cancel
        </HudButton>
      ) : (
        <span />
      )}
      <HudButton
        data-testid="block-roll-dice"
        variant="primary"
        size="lg"
        hotkey="Enter"
        onClick={onRoll}
        disabled={isRolling}
      >
        ROLL DICE
      </HudButton>
    </div>
  );
}

/** The block's odds in words, for whichever coach is looking. */
function BlockPreview({
  analysis,
  attacker,
  defender,
  isUphill,
}: {
  analysis: BlockAnalysis;
  attacker: Player | undefined;
  defender: Player | undefined;
  isUphill: boolean;
}) {
  // Online, the defending coach sees this card too: word it for them
  const viewer: BlockSide =
    defender && getActiveOnlineMatch()?.myTeamId === defender.teamId
      ? "defender"
      : "attacker";
  const viewerPicks = isUphill === (viewer === "defender");
  const previewLines =
    attacker && defender
      ? blockPreviewLines(analysis, attacker, defender, viewer)
      : [];
  return (
    <div
      data-testid="block-roll-analysis"
      className="mt-2 font-hud-body text-hud-xs leading-snug"
    >
      {previewLines.map((line, index) => (
        <div
          key={index}
          className={previewLineClass(line, index === 0 && !viewerPicks)}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function DiceCount({
  diceCount,
  isUphill,
}: {
  diceCount: number;
  isUphill: boolean;
}) {
  return (
    <div className="mt-3 flex items-center justify-center gap-3">
      <div className="font-hud-label text-hud-xl font-bold uppercase tracking-[0.06em] text-hud-bone">
        {diceCount} {diceCount === 1 ? "DIE" : "DICE"}{" "}
        {isUphill ? <span className="text-hud-bad">(UPHILL)</span> : ""}
      </div>
      <div className="hud-label">
        {isUphill ? "Defender Chooses" : "Attacker Chooses"}
      </div>
    </div>
  );
}

/**
 * The rolled dice as buttons, what to do with them, and the re-rolls
 * (children) when this coach may act.
 */
function BlockChoices({
  roll,
  canAct,
  rerollFirst,
  proMode,
  chosen,
  attackingTeamName,
  onKeep,
  onPick,
  children,
}: {
  roll: BlockRollData;
  canAct: boolean;
  rerollFirst: boolean;
  proMode: boolean;
  chosen: string | null;
  attackingTeamName: string | undefined;
  onKeep: () => void;
  onPick: (index: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      {canAct && rerollFirst && (
        <HudButton data-testid="block-keep-dice" block onClick={onKeep}>
          Keep dice
        </HudButton>
      )}
      <div className="flex justify-center gap-2">
        {canAct &&
          (!rerollFirst || proMode) &&
          roll.results.map((result, idx) => (
            <DieChoice
              key={idx}
              index={idx}
              result={result.type}
              onPick={() => onPick(idx)}
            >
              {proMode ? `Re-roll ${result.label}` : result.label}
            </DieChoice>
          ))}
      </div>
      <div className="rounded-hud border border-hud-gold/30 bg-hud-gold/10 px-3 py-2 text-center font-hud-label text-hud-base font-semibold text-hud-gold">
        {choiceStatus({
          chosen,
          proMode,
          rerollFirst,
          attackingTeamName,
          diceShown: roll.results.length,
        })}
      </div>
      {canAct && children}
    </div>
  );
}

/** Warns when the viewer does not pick, and colours each side's assists. */
function previewLineClass(line: string, warning: boolean): string {
  if (warning) return "text-hud-bad font-bold";
  if (line.startsWith("Our assists")) return "text-hud-good";
  if (line.startsWith("Their assists")) return "text-hud-bad";
  return "";
}

/** The line under the dice: what was chosen, or how to choose. */
function choiceStatus({
  chosen,
  proMode,
  rerollFirst,
  attackingTeamName,
  diceShown,
}: {
  chosen: string | null;
  proMode: boolean;
  rerollFirst: boolean;
  attackingTeamName: string | undefined;
  diceShown: number;
}): string {
  if (chosen) return `Chosen: ${chosen.replace(/-/g, " ").toUpperCase()}`;
  if (proMode)
    return `Pro: click a die in the tray, or press ${dieKeys(diceShown)}, to re-roll it (3+)`;
  if (getActiveOnlineMatch()?.mayAct() === false)
    return "The other coach is choosing…";
  if (rerollFirst)
    return `${attackingTeamName ?? "Attacking team"}: re-roll first?`;
  return `Click a die in the tray, or press ${dieKeys(diceShown)}, to choose the result`;
}

/** The re-rolls the attacker may still use on these dice. */
function BlockRerolls({
  roll,
  proMode,
  onTeamReroll,
  onTogglePro,
  onBrawlerReroll,
  onVeteranReroll,
}: {
  roll: BlockRollData;
  proMode: boolean;
  onTeamReroll: () => void;
  onTogglePro: () => void;
  onBrawlerReroll: () => void;
  onVeteranReroll: () => void;
}) {
  if (
    !roll.teamRerollAvailable &&
    !roll.proAvailable &&
    !roll.brawlerAvailable &&
    !roll.veteranRerollAvailable
  )
    return null;
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
      {roll.teamRerollAvailable && (
        <HudButton
          data-testid="block-team-reroll"
          size="sm"
          hotkey="r"
          onClick={onTeamReroll}
        >
          TEAM RE-ROLL (all dice)
        </HudButton>
      )}
      {roll.proAvailable && (
        <HudButton
          size="sm"
          variant={proMode ? "gold" : "secondary"}
          onClick={onTogglePro}
        >
          {proMode ? "PICK A DIE…" : "USE PRO (re-roll one die)"}
        </HudButton>
      )}
      {roll.brawlerAvailable && (
        <HudButton
          data-testid="block-brawler-reroll"
          size="sm"
          onClick={onBrawlerReroll}
        >
          BRAWLER: RE-ROLL 1 BOTH DOWN
        </HudButton>
      )}
      {roll.veteranRerollAvailable && (
        <HudButton
          data-testid="block-veteran-reroll"
          size="sm"
          onClick={onVeteranReroll}
        >
          VETERAN RE-ROLL (all dice, once per game)
        </HudButton>
      )}
    </div>
  );
}

/** The keys for the dice in the tray, left to right: "1", "1 or 2", "1 to 3". */
const dieKeys = (count: number) =>
  count === 1 ? "1" : count === 2 ? "1 or 2" : `1 to ${count}`;

/**
 * A die's result as a button, pressed by its number in the tray. Hidden
 * until a keyboard focuses it, then a plain button.
 */
function DieChoice({
  index,
  result,
  onPick,
  children,
}: {
  index: number;
  result: string;
  onPick: () => void;
  children: React.ReactNode;
}) {
  const button = useRef<HTMLButtonElement | null>(null);
  useHotkey(String(index + 1), onPick, true, button);
  return (
    <button
      ref={button}
      data-testid={`block-die-${index}`}
      data-block-result={result}
      onClick={onPick}
      className="sr-only focus:not-sr-only focus:rounded-hud focus:border focus:border-hud-gold focus:bg-hud-raise focus:px-3 focus:py-1 focus:font-hud-label focus:text-hud-sm focus:font-bold focus:text-hud-bone"
    >
      {children}
    </button>
  );
}
