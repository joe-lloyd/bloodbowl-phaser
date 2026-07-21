/* eslint-disable react/prop-types */
import React, { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { Player, PlayerStatus } from "../../../types/Player";
import { ActionType, GameEventNames } from "../../../types/events";
import {
  computeActionAvailability,
  ActionAvailability,
} from "../../../game/rules/actionAvailability";
import { ActionStepper } from "./ActionStepper";

interface PlayerActionMenuProps {
  eventBus: EventBus;
  // Shape lives in GameHUD (TurnData); kept loose here to avoid a cycle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  turnData: any;
}

const EMPTY_AVAILABILITY: ActionAvailability = {
  move: false,
  blitz: false,
  pass: false,
  handoff: false,
  foul: false,
  standUp: false,
  secureBall: false,
  stab: false,
  breatheFire: false,
  vomit: false,
  gaze: false,
  chomp: false,
};

export const PlayerActionMenu: React.FC<PlayerActionMenuProps> = ({
  eventBus,
  turnData,
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

  // Listen for player selection
  useEventBus(eventBus, GameEventNames.PlayerSelected, (data) => {
    // Only reset action mode if selecting a different player or deselecting
    // AND if the new player is NOT the same as the current one
    if (data.player && data.player.id === selectedPlayer?.id) {
      // Re-selection of same player - do NOT reset stepper
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

  useEventBus(eventBus, GameEventNames.TurnStarted, () => {
    setSelectedPlayer(null);
    setActionSteps([]);
    setCurrentStepId(null);
  });

  // Contextual availability: recomputed from live game state whenever the
  // selection, the turn flags, movement, or the board changes.
  const availability: ActionAvailability = React.useMemo(() => {
    if (!selectedPlayer || selectedPlayer.teamId !== turnData?.activeTeamId) {
      return EMPTY_AVAILABILITY;
    }
    try {
      if (!ServiceContainer.isInitialized()) return EMPTY_AVAILABILITY;
      const gs = ServiceContainer.getInstance().gameService;
      const live = gs.getPlayerById(selectedPlayer.id) ?? selectedPlayer;
      return computeActionAvailability({
        player: live,
        ballPosition: gs.getState().ballPosition ?? null,
        opponents: gs.getOpponents(selectedPlayer.teamId),
        teammates: gs.getTeammates(selectedPlayer.id),
        reachable: gs.getAvailableMovements(selectedPlayer.id),
        turn: {
          hasBlitzed: !!turnData.hasBlitzed,
          hasPassed: !!turnData.hasPassed,
          hasHandedOff: !!turnData.hasHandedOff,
          hasFouled: !!turnData.hasFouled,
        },
        hasMovedInAction,
      });
    } catch {
      return EMPTY_AVAILABILITY;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlayer, turnData, hasMovedInAction, refreshTick]);

  if (!selectedPlayer) return null;

  // Only show menu for active team's players
  if (selectedPlayer.teamId !== turnData.activeTeamId) return null;

  const handleAction = (action: ActionType) => {
    if (selectedPlayer) {
      eventBus.emit(GameEventNames.UI_ActionSelected, {
        action,
        playerId: selectedPlayer.id,
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
  }> = ({ action, label, sub, disabled, color = "blue", onClick }) => {
    const colorSchemes: Record<
      string,
      { bg: string; border: string; hoverBg: string; hoverBorder: string }
    > = {
      red: { bg: "#7f1d1d", border: "#991b1b", hoverBg: "#991b1b", hoverBorder: "#dc2626" },
      yellow: { bg: "#713f12", border: "#a16207", hoverBg: "#a16207", hoverBorder: "#eab308" },
      purple: { bg: "#581c87", border: "#6b21a8", hoverBg: "#6b21a8", hoverBorder: "#a855f7" },
      blue: { bg: "#1e3a8a", border: "#1e40af", hoverBg: "#1e40af", hoverBorder: "#3b82f6" },
      green: { bg: "#14532d", border: "#166534", hoverBg: "#166534", hoverBorder: "#22c55e" },
      orange: { bg: "#7c2d12", border: "#9a3412", hoverBg: "#9a3412", hoverBorder: "#f97316" },
      gray: { bg: "#374151", border: "#4b5563", hoverBg: "#4b5563", hoverBorder: "#6b7280" },
    };

    const scheme = colorSchemes[color] || colorSchemes.blue;

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onClick) onClick();
          else if (action) handleAction(action);
        }}
        disabled={disabled}
        className="group relative w-full px-3 py-1.5 border-2 rounded transition-all duration-200 flex flex-col items-start mb-1"
        style={{
          backgroundColor: disabled ? "#374151" : scheme.bg,
          borderColor: disabled ? "#4b5563" : scheme.border,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = scheme.hoverBg;
            e.currentTarget.style.borderColor = scheme.hoverBorder;
            e.currentTarget.style.transform = "translateY(-2px)";
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = scheme.bg;
            e.currentTarget.style.borderColor = scheme.border;
            e.currentTarget.style.transform = "translateY(0)";
          }
        }}
      >
        <div className="flex justify-between w-full items-center">
          <span className={`font-heading text-sm ${disabled ? "text-gray-400" : "text-white"}`}>
            {label}
          </span>
          {sub && (
            <span className="text-[10px] font-mono bg-black/30 px-1 rounded text-white/80">
              {sub}
            </span>
          )}
        </div>
      </button>
    );
  };

  const a = availability;
  // Nothing situational to offer beyond ending the activation.
  const anyContextual =
    a.blitz || a.pass || a.handoff || a.foul || a.standUp || a.secureBall ||
    a.stab || a.breatheFire || a.vomit || a.gaze || a.chomp;

  return (
    <div
      className="w-full max-h-[60vh] flex flex-col pointer-events-auto animate-fade-in z-50"
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
      {/* Header */}
      <div className="flex items-center justify-between bg-black/80 px-3 py-1 border-t-2 border-x-2 border-bb-gold rounded-t-md">
        <span className="font-heading text-bb-gold text-lg truncate">
          {selectedPlayer.playerName || "Unknown"}
        </span>
        <span className="text-xs text-gray-400">
          {selectedPlayer.positionName}
        </span>
      </div>

      {/* Menu Body */}
      {actionSteps.length > 0 ? (
        <ActionStepper
          steps={actionSteps}
          currentStepId={currentStepId || ""}
          eventBus={eventBus}
          hasMovedInAction={hasMovedInAction}
        />
      ) : (
        <div className="bg-bb-parchment border-2 border-bb-gold p-2 rounded-b-md shadow-lg flex flex-col overflow-y-auto max-h-[50vh] scrollbar-thin scrollbar-thumb-bb-gold">
          <div className="space-y-1">
            {/* Only actions with a legal target this activation are shown. */}
            {a.blitz && (
              <ActionButton action="blitz" label="BLITZ" sub="1/Turn" disabled={false} color="red" />
            )}
            {a.pass && (
              <ActionButton action="pass" label="PASS" sub="1/Turn" disabled={false} color="yellow" />
            )}
            {a.handoff && (
              <ActionButton action="handoff" label="HAND-OFF" sub="1/Turn" disabled={false} color="yellow" />
            )}
            {a.foul && (
              <ActionButton action="foul" label="FOUL" sub="1/Turn" disabled={false} color="purple" />
            )}

            {/* Special actions — only when the player has the trait and an
                adjacent Standing opponent to target. */}
            {a.stab && (
              <ActionButton action="stab" label="STAB" sub="Special" disabled={false} color="orange" />
            )}
            {a.breatheFire && (
              <ActionButton action="breatheFire" label="BREATHE FIRE" sub="Special" disabled={false} color="orange" />
            )}
            {a.vomit && (
              <ActionButton action="vomit" label="PROJECTILE VOMIT" sub="Special" disabled={false} color="green" />
            )}
            {a.gaze && (
              <ActionButton action="gaze" label="HYPNOTIC GAZE" sub="Special" disabled={false} color="purple" />
            )}
            {a.chomp && (
              <ActionButton action="chomp" label="CHOMP" sub="Special" disabled={false} color="orange" />
            )}

            {isProne && (
              <ActionButton action="standUp" label="STAND UP" sub="3 MA" disabled={!a.standUp} color="blue" />
            )}

            {a.secureBall && (
              <ActionButton action="secureBall" label="SECURE BALL" sub="Pick Up" disabled={false} color="blue" />
            )}

            {!anyContextual && (
              <div className="text-xs italic text-bb-text/60 px-1 py-1 text-center">
                No special actions available — click a square to move.
              </div>
            )}

            <ActionButton action="forgoe" label="END ACTIVATION" sub="Skip" disabled={hasActed} color="gray" />
          </div>
        </div>
      )}
    </div>
  );
};
