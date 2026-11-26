import { useAfterDice } from "../../hooks/useAfterDice";
import { DecisionTeam } from "./DecisionTeam";
import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import type { EventBus } from "../../../services/EventBus";
import {
  blockPreview,
} from "../../../game/rules/rollPreview";
import { type BlockAnalysis } from "../../../types/Actions";
import type { Player } from "../../../types/Player";
import {
  type BlockResult,
  type BlockRollData,
} from "../../../services/BlockResolutionService";
import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";
import { useHotkey } from "../../hotkeys";
import { PHONE_QUERY, matchesMedia } from "../../../game/presentation/phoneLayout";

interface BlockDiceDialogProps {
  eventBus: EventBus;
}

export const BlockDiceDialog: React.FC<BlockDiceDialogProps> = ({
  eventBus,
}) => {
  const [isOpen, setIsOpen] = useState(false);

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

  const [chosen, setChosen] = useState<string | null>(null);

  const [isRolling, setIsRolling] = useState(false);
  const [rollData, setRollData] = useState<BlockRollData | null>(null);

  const pickRef = useRef<((index: number) => void) | null>(null);
  useEffect(() => {
    const onPick = ({ index }: { index: number }) => pickRef.current?.(index);
    eventBus.on(GameEventNames.UI_BlockDieClicked, onPick);
    return () => {
      eventBus.off(GameEventNames.UI_BlockDieClicked, onPick);
    };
  }, [eventBus]);

  const [proMode, setProMode] = useState(false);

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    const onOpen = (payload: {
      attackerId: string;
      defenderId: string;
      analysis: BlockAnalysis;
    }) => {
      clearTimeout(holdTimer);
      setChosen(null);
      setData(payload);
      setRollData(null);
      setIsRolling(false);
      setProMode(false);
      setIsOpen(true);
    };

    const onDiceRolled = (payload: BlockRollData) => {
      clearTimeout(holdTimer);
      setIsRolling(false);
      setProMode(false);
      setChosen(null);

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

      setRollData(payload);
      setIsOpen(true);
    };

    const onRollCancelled = () => {
      clearTimeout(holdTimer);
      setChosen(null);
      setIsOpen(false);
      setIsRolling(false);
      setRollData(null);
    };

    eventBus.on(GameEventNames.TurnEnded, onRollCancelled);
    eventBus.on(GameEventNames.UI_BlockDialog, onOpen);
    const onRollStarted = () => {
      setIsRolling(true);
    };
    eventBus.on(GameEventNames.UI_RollBlockDice, onRollStarted);
    eventBus.on(GameEventNames.BlockDiceRolled, onDiceRolled);
    eventBus.on(GameEventNames.BlockDiceKept, onDiceRolled);
    eventBus.on(GameEventNames.UI_BlockRollCancelled, onRollCancelled);

    const onRejected = ({ commandType }: { commandType: string }) => {
      if (commandType === "block" || commandType === "multiple-block")
        onRollCancelled();
    };
    eventBus.on(GameEventNames.NetworkCommandRejected, onRejected);

    const onResolved = ({
      type,
      result,
    }: {
      type: string;
      result?: string;
    }) => {
      if (type !== "block-dice") return;

      if (getActiveOnlineMatch() && result) {
        setIsOpen(true);
        setChosen(result);
        clearTimeout(holdTimer);
        holdTimer = setTimeout(onRollCancelled, 1500);
        return;
      }
      onRollCancelled();
    };
    eventBus.on(GameEventNames.DecisionResolved, onResolved);

    return () => {
      clearTimeout(holdTimer);
      eventBus.off(GameEventNames.TurnEnded, onRollCancelled);
      eventBus.off(GameEventNames.UI_BlockDialog, onOpen);
      eventBus.off(GameEventNames.UI_RollBlockDice, onRollStarted);
      eventBus.off(GameEventNames.BlockDiceRolled, onDiceRolled);
      eventBus.off(GameEventNames.BlockDiceKept, onDiceRolled);
      eventBus.off(GameEventNames.UI_BlockRollCancelled, onRollCancelled);
      eventBus.off(GameEventNames.NetworkCommandRejected, onRejected);
      eventBus.off(GameEventNames.DecisionResolved, onResolved);
    };
  }, [eventBus]);

  const shownRoll = useAfterDice(eventBus, rollData);

  useLayoutEffect(() => {
    if (!isOpen || !data) {
      pickRef.current = null;
      return;
    }
    pickRef.current = (index: number) => {
      const result = shownRoll?.results[index];
      if (!result) return;
      if (proMode) handleProReroll(index);
      else if (!rerollFirst) handleSelectResult(result);
    };
    return () => {
      pickRef.current = null;
    };
  });

  if (!isOpen || !data) {
    return null;
  }

  const { analysis } = data;
  const { attackerST, defenderST } = analysis;
  const { diceCount, isUphill } = diceAndPicker(analysis, rollData);

  const canAct = !chosen && getActiveOnlineMatch()?.mayAct() !== false;
  const rerollFirst = rollData?.choiceStage === "attacker-reroll";
  const { attacker, defender, attackingTeamName } = blockSides(data);

  const handleRoll = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;

    setIsRolling(true);

    eventBus.emit(GameEventNames.UI_RollBlockDice, {
      attackerId: data.attackerId,
      defenderId: data.defenderId,
      numDice: diceCount,
      isAttackerChoice: !isUphill,
    });
  };

  const handleSelectResult = (result: BlockResult) => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;

    eventBus.emit(GameEventNames.UI_BlockResultSelected, {
      attackerId: data.attackerId,
      defenderId: data.defenderId,
      result,
    });

    setIsOpen(false);
  };

  const handleTeamReroll = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_TeamRerollBlock, {
      attackerId: data.attackerId,
    });
  };

  const handleProReroll = (dieIndex: number) => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    setProMode(false);
    eventBus.emit(GameEventNames.UI_ProRerollBlockDie, {
      attackerId: data.attackerId,
      dieIndex,
    });
  };

  const handleBrawlerReroll = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_BrawlerRerollBlockDie, {
      attackerId: data.attackerId,
    });
  };

  const handleVeteranReroll = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_VeteranRerollBlock, {
      attackerId: data.attackerId,
    });
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

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
      actions={
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
      <div className="flex items-stretch gap-2">
        <div className="flex flex-1 flex-col items-center rounded-hud border border-hud-good/30 bg-black/35 py-1.5 phone:flex-row phone:justify-center phone:gap-2 phone:py-0">
          <span className="hud-label">ATTACKER</span>
          <span className="font-hud-display text-hud-2xl text-hud-good">
            {attackerST}
          </span>
        </div>
        <div className="flex items-center px-1 font-hud-display text-hud-xl text-hud-gold">
          VS
        </div>
        <div className="flex flex-1 flex-col items-center rounded-hud border border-hud-bad/30 bg-black/35 py-1.5 phone:flex-row phone:justify-center phone:gap-2 phone:py-0">
          <span className="hud-label">DEFENDER</span>
          <span className="font-hud-display text-hud-2xl text-hud-bad">
            {defenderST}
          </span>
        </div>
      </div>

      <BlockMath
        analysis={{ ...analysis, diceCount, isUphill }}
        attacker={attacker}
        defender={defender}
      />

      {shownRoll ? (
        <BlockChoices
          roll={shownRoll}
          canAct={canAct}
          rerollFirst={rerollFirst}
          proMode={proMode}
          chosen={chosen}
          attackingTeamName={attackingTeamName}
          onKeep={() => {
            eventBus.emit(GameEventNames.UI_KeepBlockDice, {
              attackerId: data.attackerId,
            });
          }}
          onPick={(index) => pickRef.current?.(index)}
        >
          <BlockRerolls
            roll={shownRoll}
            proMode={proMode}
            onTeamReroll={handleTeamReroll}
            onTogglePro={() => {
              setProMode((m) => !m);
            }}
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

function diceAndPicker(
  analysis: BlockAnalysis,
  rollData: BlockRollData | null
): { diceCount: number; isUphill: boolean } {
  if (!rollData)
    return { diceCount: analysis.diceCount, isUphill: analysis.isUphill };
  return { diceCount: rollData.numDice, isUphill: !rollData.isAttackerChoice };
}

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
    <div className="flex items-center justify-between gap-2 [&>button]:whitespace-nowrap [&>button]:px-3">
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
        hotkey="Enter"
        onClick={onRoll}
        disabled={isRolling}
      >
        ROLL DICE
      </HudButton>
    </div>
  );
}

function BlockMath({
  analysis,
  attacker,
  defender,
}: {
  analysis: BlockAnalysis;
  attacker: Player | undefined;
  defender: Player | undefined;
}) {
  if (!attacker || !defender) return null;
  const { viewerPicks, dice, strength, notes } = blockPreview(
    analysis,
    attacker,
    defender,
    getActiveOnlineMatch()?.myTeamId ?? attacker.teamId
  );
  const lines = strength.includes("+") ? [strength, ...notes] : notes;
  return (
    <div data-testid="block-roll-analysis">
      <p
        className={`mt-3 phone:mt-1 text-center font-hud-label text-hud-xl phone:text-hud-base font-bold uppercase tracking-[0.06em] ${viewerPicks ? "text-hud-bone" : "text-hud-bad"}`}
      >
        {dice}
      </p>
      {lines.length > 0 && (
        <div className="mt-2 font-hud-body text-hud-xs leading-snug">
          {lines.map((line) => (
            <div key={line} className={previewLineClass(line)}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
    <div className="mt-3 phone:mt-1">
      {canAct && rerollFirst && (
        <HudButton data-testid="block-keep-dice" block onClick={onKeep}>
          Keep dice
        </HudButton>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {canAct &&
          (!rerollFirst || proMode) &&
          roll.results.map((result, idx) => (
            <DieChoice
              key={idx}
              index={idx}
              result={result.type}
              onPick={() => {
                onPick(idx);
              }}
            >
              {proMode ? `Re-roll ${result.label}` : result.label}
            </DieChoice>
          ))}
      </div>
      <div className="rounded-hud border border-hud-gold/30 bg-hud-gold/10 px-3 py-2 phone:mt-1.5 phone:py-0.5 phone:text-hud-sm text-center font-hud-label text-hud-base font-semibold text-hud-gold">
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

function previewLineClass(line: string): string {
  if (line.startsWith("Our assists")) return "text-hud-good";
  if (line.startsWith("Their assists")) return "text-hud-bad";
  return "";
}

function choiceStatus({
  chosen,
  proMode,
  rerollFirst,
  attackingTeamName = "Attacking team",
  diceShown,
}: {
  chosen: string | null;
  proMode: boolean;
  rerollFirst: boolean;
  attackingTeamName: string | undefined;
  diceShown: number;
}): string {
  if (chosen) return `Chosen: ${chosen.replaceAll('-', " ").toUpperCase()}`;
  if (proMode)
    return `Pro: ${pickText(diceShown)}, to re-roll it (3+)`;
  if (getActiveOnlineMatch()?.mayAct() === false)
    return "The other coach is choosing…";
  if (rerollFirst)
    return `${attackingTeamName}: re-roll first?`;
  return matchesMedia(PHONE_QUERY)
    ? "Tap a result"
    : `Click a die in the tray, or press ${dieKeys(diceShown)}, to choose the result`;
}

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
          variant={proMode ? "selected" : "secondary"}
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

function pickText(diceShown: number): string {
  return matchesMedia(PHONE_QUERY)
    ? "tap a die"
    : `click a die in the tray, or press ${dieKeys(diceShown)}`;
}

const dieKeys = (count: number) =>
  count === 1 ? "1" : count === 2 ? "1 or 2" : `1 to ${String(count)}`;

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
      data-testid={`block-die-${String(index)}`}
      data-block-result={result}
      onClick={onPick}
      className="sr-only phone:not-sr-only phone:min-h-[48px] phone:min-w-[84px] phone:flex-1 phone:rounded-hud phone:border phone:border-hud-gold/60 phone:bg-hud-raise phone:px-2 phone:font-hud-label phone:text-hud-base phone:font-bold phone:text-hud-bone focus:not-sr-only focus:rounded-hud focus:border focus:border-hud-gold focus:bg-hud-raise focus:px-3 focus:py-1 focus:font-hud-label focus:text-hud-sm focus:font-bold focus:text-hud-bone"
    >
      {children}
    </button>
  );
}
