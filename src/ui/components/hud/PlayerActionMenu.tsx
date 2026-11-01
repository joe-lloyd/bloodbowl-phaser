import { useHeldOnline } from "../../hooks/useHeldOnline";
/* eslint-disable react/prop-types */
import { holdsMeasure } from "../../../game/inducements/matchInducements";
import { DesperateMeasure } from "../../../game/inducements/desperateMeasures";
import React, { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { Player, PlayerStatus } from "../../../types/Player";
import { GamePhase } from "../../../types/GameState";
import { ActionType, GameEventNames } from "../../../types/events";
import {
  computeActionAvailability,
  ActionAvailability,
} from "../../../game/rules/actionAvailability";
import { ActionStepper } from "./ActionStepper";
import {
  Chip,
  HudTone,
  Panel,
  PanelHeader,
  toneBar,
} from "../componentWarehouse/HudKit";

/** The menu's colour names, mapped onto the HUD's tones. */
const ACTION_TONES: Record<string, HudTone> = {
  red: "bad",
  yellow: "gold",
  purple: "skill",
  blue: "info",
  green: "good",
  orange: "warn",
  gray: "neutral",
};
import {
  BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "../../../types/BlockReplacement";

interface PlayerActionMenuProps {
  eventBus: EventBus;
  // Shape lives in GameHUD (TurnData); kept loose here to avoid a cycle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  turnData: any;
  /** A narrow thumb rail of buttons, as on a phone: no header, no hints. */
  compact?: boolean;
}

const EMPTY_AVAILABILITY: ActionAvailability = {
  move: false,
  block: false,
  multipleBlock: false,
  jump: false,
  blitz: false,
  pass: false,
  punt: false,
  handoff: false,
  foul: false,
  standUp: false,
  secureBall: false,
  stab: false,
  breatheFire: false,
  vomit: false,
  gaze: false,
  chomp: false,
  chainsaw: false,
  throwTeammate: false,
  kickTeammate: false,
  throwBomb: false,
  ballAndChain: false,
  directBlockReplacements: [],
  blitzBlockReplacements: [],
};

export const PlayerActionMenu: React.FC<PlayerActionMenuProps> = ({
  eventBus,
  turnData,
  compact = false,
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Stepper State
  const [actionSteps, setActionSteps] = useState<
    { id: string; label: string }[]
  >([]);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [hasMovedInAction, setHasMovedInAction] = useState(false);
  // Bumped by board-changing events so the contextual menu re-evaluates.
  const [refreshTick, setRefreshTick] = useState(0);
  // Online, the panel goes while this coach cannot send a command (the
  // other coach dropped, or the clock is paused); the banner says why.
  const held = useHeldOnline();

  // Listen for player selection
  useEventBus(eventBus, GameEventNames.PlayerSelected, (data) => {
    // Only reset action mode if selecting a different player or deselecting
    // AND if the new player is NOT the same as the current one
    if (data.player && data.player.id === selectedPlayer?.id) {
      // Re-selection of same player - do NOT reset stepper. Still read the
      // game again: Charge! re-selects the charger the coach just picked,
      // and only then may that player act.
      setRefreshTick((t) => t + 1);
      return;
    }

    if (data.player?.id !== selectedPlayer?.id) {
      setActionSteps([]);
      setCurrentStepId(null);
      setHasMovedInAction(false);
    }
    setSelectedPlayer(data.player);
  });

  // Listen for action steps update (New Stepper Model)
  useEventBus(eventBus, GameEventNames.UI_UpdateActionSteps, (data) => {
    if (data.steps && data.steps.length > 0) {
      setActionSteps(data.steps);
      setCurrentStepId(data.currentStepId);
    } else {
      setActionSteps([]);
      setCurrentStepId(null);
      setHasMovedInAction(false);
    }
  });

  // Determine initial movement state on selection
  React.useEffect(() => {
    if (selectedPlayer && turnData) {
      const movementUsed =
        turnData.movementUsed instanceof Map
          ? turnData.movementUsed.get(selectedPlayer.id)
          : turnData.movementUsed?.[selectedPlayer.id] || 0;

      if (movementUsed > 0 && !selectedPlayer.hasActed) {
        setHasMovedInAction(true);
      } else {
        setHasMovedInAction(false);
      }
    }
  }, [selectedPlayer, turnData]);

  useEventBus(eventBus, GameEventNames.PlayerMovedInAction, (data) => {
    if (selectedPlayer && data.playerId === selectedPlayer.id) {
      setHasMovedInAction(true);
    }
  });

  // Board changes that affect which actions are contextually valid.
  const bump = () => setRefreshTick((t) => t + 1);
  useEventBus(eventBus, GameEventNames.PlayerMoved, bump);
  useEventBus(eventBus, GameEventNames.PlayerStatusChanged, bump);
  useEventBus(eventBus, GameEventNames.PlayerKnockedDown, bump);
  useEventBus(eventBus, GameEventNames.BallPlaced, bump);

  // A turnover ends the turn, so the panel goes with the turnover banner
  // rather than waiting under it for the next turn to start.
  const close = () => {
    setSelectedPlayer(null);
    setActionSteps([]);
    setCurrentStepId(null);
  };
  useEventBus(eventBus, GameEventNames.TurnStarted, close);
  useEventBus(eventBus, GameEventNames.Turnover, close);

  const kickoffStep = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getKickoffEventStep()
    : null;
  const activeCharge =
    turnData?.phase === GamePhase.KICKOFF && kickoffStep?.charge?.activePlayerId
      ? kickoffStep
      : null;
  const effectiveActiveTeamId = activeCharge?.teamId ?? turnData?.activeTeamId;

  // Contextual availability: recomputed from live game state whenever the
  // selection, the turn flags, movement, or the board changes.
  const availability: ActionAvailability = React.useMemo(() => {
    if (!selectedPlayer || selectedPlayer.teamId !== effectiveActiveTeamId) {
      return EMPTY_AVAILABILITY;
    }
    try {
      if (!ServiceContainer.isInitialized()) return EMPTY_AVAILABILITY;
      const gs = ServiceContainer.getInstance().gameService;
      const live = gs.getPlayerById(selectedPlayer.id) ?? selectedPlayer;
      const normal = computeActionAvailability({
        player: live,
        ballPosition: gs.getState().ballPosition ?? null,
        opponents: gs.getOpponents(selectedPlayer.teamId),
        teammates: gs.getTeammates(selectedPlayer.id),
        reachable: gs.getAvailableMovements(selectedPlayer.id),
        turn: {
          hasBlitzed: !!turnData.hasBlitzed,
          hasPassed: !!turnData.hasPassed,
          hasHandedOff: !!turnData.hasHandedOff,
          // Grudge Match (L24) allows a second Foul this turn.
          hasFouled:
            !!turnData.hasFouled &&
            !holdsMeasure(
              gs.getState(),
              selectedPlayer.teamId,
              DesperateMeasure.GRUDGE_MATCH
            ),
        },
        hasMovedInAction,
      });
      if (!activeCharge || activeCharge.charge?.activePlayerId !== live.id) {
        return normal;
      }
      const budget = activeCharge.charge.budget;
      return {
        ...EMPTY_AVAILABILITY,
        move: live.status === PlayerStatus.ACTIVE,
        blitz: budget.blitz > 0 && normal.blitz,
        throwTeammate: budget.throwTeammate > 0 && normal.throwTeammate,
        kickTeammate: budget.kickTeammate > 0 && normal.kickTeammate,
      };
    } catch {
      return EMPTY_AVAILABILITY;
    }
  }, [
    selectedPlayer,
    turnData,
    hasMovedInAction,
    refreshTick,
    effectiveActiveTeamId,
    activeCharge,
  ]);

  if (!selectedPlayer || held) return null;

  // The kicker and ordinary kickoff selections do not get an action menu.
  // Charge! is the exception: it deliberately reuses this normal window.
  if (turnData?.phase === GamePhase.KICKOFF && !activeCharge) return null;

  // Only show menu for active team's players
  if (selectedPlayer.teamId !== effectiveActiveTeamId) return null;

  const handleAction = (
    action: ActionType,
    blockReplacement?: BlockReplacement
  ) => {
    if (selectedPlayer) {
      eventBus.emit(GameEventNames.UI_ActionSelected, {
        action,
        playerId: selectedPlayer.id,
        blockReplacement,
      });
    }
  };

  const isProne = selectedPlayer.status === PlayerStatus.PRONE;
  const hasActed = selectedPlayer.hasActed;

  // Render Helper with proper color handling
  const ActionButton: React.FC<{
    action?: ActionType;
    label: string;
    sub?: string;
    disabled?: boolean;
    color?: string;
    onClick?: () => void;
    blockReplacement?: BlockReplacement;
  }> = ({
    action,
    label,
    sub,
    disabled,
    color = "blue",
    onClick,
    blockReplacement,
  }) => {
    const tone = ACTION_TONES[color] ?? ACTION_TONES.blue;

    // A stable hook for E2E: the button's visible label is styling-dependent
    // and duplicated across replacement variants, so cases target the action
    // (and its replacement, where there is one) instead.
    const testId = blockReplacement
      ? `action-${action ?? "block"}-${blockReplacement}`
      : `action-${action ?? label.toLowerCase().replace(/\s+/g, "-")}`;

    if (compact) {
      return (
        <button
          data-testid={testId}
          onClick={(e) => {
            e.stopPropagation();
            if (onClick) onClick();
            else if (action) handleAction(action, blockReplacement);
          }}
          disabled={disabled}
          className="relative flex min-h-[44px] w-full flex-col items-start justify-center overflow-hidden rounded-hud border border-white/10 bg-hud-ink/90 py-1 pl-3 pr-1.5 text-left shadow-hud active:bg-hud-edge disabled:opacity-45"
        >
          <span
            aria-hidden
            className={`absolute inset-y-0 left-0 w-[4px] ${toneBar(tone)}`}
          />
          <span
            className={`font-hud-label text-hud-sm font-bold uppercase leading-tight tracking-[0.04em] ${
              disabled ? "text-hud-mute" : "text-hud-bone"
            }`}
          >
            {label}
          </span>
          {sub && (
            <span className="font-hud-label text-hud-2xs font-bold uppercase leading-none tracking-[0.06em] text-hud-dim">
              {sub}
            </span>
          )}
        </button>
      );
    }

    return (
      <button
        data-testid={testId}
        onClick={(e) => {
          e.stopPropagation();
          if (onClick) onClick();
          else if (action) handleAction(action, blockReplacement);
        }}
        disabled={disabled}
        className="group relative flex min-h-[40px] w-full items-center justify-between gap-2 overflow-hidden rounded-hud border border-white/10 bg-hud-raise/80 py-1.5 pl-4 pr-2 text-left transition-[background-color,border-color,transform] duration-150 ease-bb hover:-translate-y-px hover:border-hud-gold/60 hover:bg-hud-edge active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:border-white/10 disabled:hover:bg-hud-raise/80"
      >
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[4px] ${toneBar(tone)}`}
        />
        <span
          className={`font-hud-label text-hud-base font-bold uppercase leading-tight tracking-[0.05em] ${
            disabled ? "text-hud-mute" : "text-hud-bone"
          }`}
        >
          {label}
        </span>
        {sub && <Chip tone={disabled ? "neutral" : tone}>{sub}</Chip>}
      </button>
    );
  };

  const a = availability;
  // Nothing situational to offer beyond ending the activation.
  const anyContextual =
    a.block ||
    a.multipleBlock ||
    a.blitz ||
    a.pass ||
    a.punt ||
    a.handoff ||
    a.foul ||
    a.standUp ||
    a.secureBall ||
    a.stab ||
    a.breatheFire ||
    a.vomit ||
    a.gaze ||
    a.chomp ||
    a.chainsaw ||
    a.throwTeammate ||
    a.kickTeammate ||
    a.throwBomb ||
    a.ballAndChain;

  return (
    <div
      data-testid="player-action-menu"
      className="w-full max-h-[60vh] min-h-0 shrink flex flex-col pointer-events-auto animate-hud-in z-50"
      style={{ pointerEvents: "auto", zIndex: 9999 }}
      onClick={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
    >
      <Panel
        accent="gold"
        className={
          compact
            ? "flex min-h-0 flex-col !border-0 !bg-transparent !shadow-none"
            : "flex min-h-0 flex-col"
        }
      >
        {!compact && (
          <PanelHeader
            title={selectedPlayer.playerName || "Unknown"}
            aside={selectedPlayer.positionName}
          />
        )}

        {/* Menu Body */}
        {actionSteps.length > 0 ? (
          <ActionStepper
            steps={actionSteps}
            currentStepId={currentStepId || ""}
            eventBus={eventBus}
            hasMovedInAction={hasMovedInAction}
            compact={compact}
          />
        ) : (
          <div
            className={`hud-scroll flex min-h-0 flex-1 flex-col overflow-y-auto ${compact ? "" : "p-2"}`}
          >
            <div className={`flex flex-col ${compact ? "gap-1.5" : "gap-1"}`}>
              {/* Move opens the Move sequence panel (Stand Up → Move → Jump);
                a prone player stands up as its first step. Clicking an empty
                square still auto-moves. */}
              {a.move && (
                <ActionButton
                  action="move"
                  label="MOVE"
                  sub={isProne ? "Stand + Move" : a.jump ? "Jump" : undefined}
                  disabled={false}
                  color="green"
                />
              )}
              {/* Block without moving; auto-block on clicking an adjacent enemy
                still works. */}
              {a.block && (
                <ActionButton
                  action="block"
                  label="BLOCK"
                  disabled={false}
                  color="red"
                />
              )}
              {a.multipleBlock && (
                <ActionButton
                  action="multipleBlock"
                  label="MULTIPLE BLOCK"
                  sub="2 Targets"
                  disabled={false}
                  color="red"
                />
              )}

              {/* Only actions with a legal target this activation are shown. */}
              {a.blitz && (
                <ActionButton
                  action="blitz"
                  label="BLITZ"
                  sub="1/Turn"
                  disabled={false}
                  color="red"
                />
              )}
              {a.blitzBlockReplacements.map((replacement) => (
                <ActionButton
                  key={`blitz-${replacement}`}
                  action="blitz"
                  blockReplacement={replacement}
                  label={`BLITZ (WITH ${BLOCK_REPLACEMENT_DEFINITIONS[
                    replacement
                  ].label.toUpperCase()})`}
                  sub="1/Turn"
                  disabled={false}
                  color="red"
                />
              ))}
              {a.pass && (
                <ActionButton
                  action="pass"
                  label="PASS"
                  sub="1/Turn"
                  disabled={false}
                  color="yellow"
                />
              )}
              {a.punt && (
                <ActionButton
                  action="punt"
                  label="PUNT"
                  sub="1/Turn"
                  disabled={false}
                  color="yellow"
                />
              )}
              {a.handoff && (
                <ActionButton
                  action="handoff"
                  label="HAND-OFF"
                  sub="1/Turn"
                  disabled={false}
                  color="yellow"
                />
              )}
              {a.foul && (
                <ActionButton
                  action="foul"
                  label="FOUL"
                  sub="1/Turn"
                  disabled={false}
                  color="purple"
                />
              )}

              {/* Special actions — only when the player has the trait and an
                adjacent Standing opponent to target. */}
              {a.stab && (
                <ActionButton
                  action="stab"
                  blockReplacement="stab"
                  label="STAB"
                  sub="Special"
                  disabled={false}
                  color="orange"
                />
              )}
              {a.breatheFire && (
                <ActionButton
                  action="breatheFire"
                  blockReplacement="breatheFire"
                  label="BREATHE FIRE"
                  sub="Special"
                  disabled={false}
                  color="orange"
                />
              )}
              {a.vomit && (
                <ActionButton
                  action="vomit"
                  blockReplacement="vomit"
                  label="PROJECTILE VOMIT"
                  sub="Special"
                  disabled={false}
                  color="green"
                />
              )}
              {a.gaze && (
                <ActionButton
                  action="gaze"
                  label="HYPNOTIC GAZE"
                  sub="Special"
                  disabled={false}
                  color="purple"
                />
              )}
              {a.chomp && (
                <ActionButton
                  action="chomp"
                  blockReplacement="chomp"
                  label="CHOMP"
                  sub="Special"
                  disabled={false}
                  color="orange"
                />
              )}
              {a.chainsaw && (
                <ActionButton
                  action="chainsaw"
                  blockReplacement="chainsaw"
                  label="CHAINSAW"
                  sub="Special"
                  disabled={false}
                  color="orange"
                />
              )}
              {a.throwBomb && (
                <ActionButton
                  action="throwBomb"
                  label="THROW BOMB"
                  sub="Special"
                  disabled={false}
                  color="orange"
                />
              )}
              {a.ballAndChain && (
                <ActionButton
                  action="ballAndChain"
                  label="BALL & CHAIN"
                  sub="Special"
                  disabled={false}
                  color="orange"
                />
              )}
              {a.throwTeammate && (
                <ActionButton
                  action="throwTeamMate"
                  label="THROW TEAM-MATE"
                  sub="Special"
                  disabled={false}
                  color="green"
                />
              )}
              {a.kickTeammate && (
                <ActionButton
                  action="throwTeamMate"
                  label="KICK TEAM-MATE"
                  sub="Special"
                  disabled={false}
                  color="green"
                />
              )}

              {isProne && (
                <ActionButton
                  action="standUp"
                  label="STAND UP"
                  sub="3 MA"
                  disabled={!a.standUp}
                  color="blue"
                />
              )}

              {a.secureBall && (
                <ActionButton
                  action="secureBall"
                  label="SECURE BALL"
                  sub="Pick Up"
                  disabled={false}
                  color="blue"
                />
              )}

              {!anyContextual && !compact && (
                <div className="px-1 py-1 text-center text-hud-sm italic text-hud-dim">
                  No special actions available — click a square to move.
                </div>
              )}

              <ActionButton
                action="forgoe"
                label="END ACTIVATION"
                sub="Skip"
                disabled={hasActed}
                color="gray"
              />
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
};

