/* eslint-disable react/prop-types */
import React, { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { Player, PlayerStatus } from "../../../types/Player";
import { ActionType, GameEventNames } from "../../../types/events";
import { ActionStepper } from "./ActionStepper";

interface PlayerActionMenuProps {
  eventBus: EventBus;
  turnData; // Typed as TurnData in real code
}

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

  // Listen for player selection
  useEventBus(eventBus, GameEventNames.PlayerSelected, (data) => {
    // Only reset action mode if selecting a different player or deselecting
    // AND if the new player is NOT the same as the current one
    if (data.player && data.player.id === selectedPlayer?.id) {
      // Re-selection of same player - do NOT reset stepper
      return;
    }

    if (data.player?.id !== selectedPlayer?.id) {
      console.log("Player selection changed, resetting action mode");
      setActionSteps([]);
      setCurrentStepId(null);
      setHasMovedInAction(false);
    }
    setSelectedPlayer(data.player);
  });

  // Listen for action steps update (New Stepper Model)
  useEventBus(eventBus, GameEventNames.UI_UpdateActionSteps, (data) => {
    console.log("UI_UpdateActionSteps:", data);
    if (data.steps && data.steps.length > 0) {
      setActionSteps(data.steps);
      setCurrentStepId(data.currentStepId);
    } else {
      setActionSteps([]);
      setCurrentStepId(null);
      setHasMovedInAction(false);
    }
  });

  useEventBus(eventBus, GameEventNames.PlayerMovedInAction, () => {
    setHasMovedInAction(true);
  });

  useEventBus(eventBus, GameEventNames.TurnStarted, () => {
    setSelectedPlayer(null);
    setActionSteps([]);
    setCurrentStepId(null);
  });

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
  const isStunned = selectedPlayer.status === PlayerStatus.STUNNED;
  const hasActed = selectedPlayer.hasActed;

  // Action Availability Logic
  const canMove = !hasActed && !isProne && !isStunned;
  const canBlitz = canMove && !turnData.hasBlitzed;
  const canPass = canMove && !turnData.hasPassed;
  const canHandoff = canMove && !turnData.hasHandedOff;
  const canFoul = canMove && !turnData.hasFouled;
  const canStandUp = isProne && !hasActed && !isStunned;

  // Render Helper with proper color handling
  const ActionButton = ({
    action,
    label,
    sub,
    disabled,
    color = "blue",
    onClick,
  }) => {
    // Define color schemes with proper values
    const colorSchemes: Record<
      string,
      { bg: string; border: string; hoverBg: string; hoverBorder: string }
    > = {
      red: {
        bg: "#7f1d1d",
        border: "#991b1b",
        hoverBg: "#991b1b",
        hoverBorder: "#dc2626",
      },
      yellow: {
        bg: "#713f12",
        border: "#a16207",
        hoverBg: "#a16207",
        hoverBorder: "#eab308",
      },
      purple: {
        bg: "#581c87",
        border: "#6b21a8",
        hoverBg: "#6b21a8",
        hoverBorder: "#a855f7",
      },
      blue: {
        bg: "#1e3a8a",
        border: "#1e40af",
        hoverBg: "#1e40af",
        hoverBorder: "#3b82f6",
      },
      green: {
        bg: "#14532d",
        border: "#166534",
        hoverBg: "#166534",
        hoverBorder: "#22c55e",
      },
      gray: {
        bg: "#374151",
        border: "#4b5563",
        hoverBg: "#4b5563",
        hoverBorder: "#6b7280",
      },
    };

    const scheme = colorSchemes[color] || colorSchemes.blue;

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onClick) {
            onClick();
          } else {
            handleAction(action);
          }
        }}
        disabled={disabled}
        className="group relative w-full px-3 py-2 border-2 rounded transition-all duration-200 flex flex-col items-start mb-1"
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
            e.currentTarget.style.boxShadow =
              "0 10px 15px -3px rgba(0, 0, 0, 0.1)";
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = scheme.bg;
            e.currentTarget.style.borderColor = scheme.border;
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
          }
        }}
      >
        <div className="flex justify-between w-full items-center">
          <span
            className={`font-heading text-sm ${
              disabled ? "text-gray-400" : "text-white"
            }`}
          >
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
        // SHOW STEPPER UI
        <ActionStepper
          steps={actionSteps}
          currentStepId={currentStepId || ""}
          eventBus={eventBus}
          hasMovedInAction={hasMovedInAction}
        />
      ) : (
        // SHOW DEFAULT ACTION MENU
        <div className="bg-bb-parchment border-2 border-bb-gold p-2 rounded-b-md shadow-lg flex flex-col overflow-y-auto max-h-[50vh] scrollbar-thin scrollbar-thumb-bb-gold">
          <div className="space-y-1">
            {/* Special Turn Actions */}
            <ActionButton
              action="blitz"
              label="BLITZ"
              sub="1/Turn"
              disabled={!canBlitz}
              color="red"
            />
            <ActionButton
              action="pass"
              label="PASS"
              sub="1/Turn"
              disabled={!canPass}
              color="yellow"
            />
            <ActionButton
              action="handoff"
              label="HAND-OFF"
              sub="1/Turn"
              disabled={!canHandoff}
              color="yellow"
            />
            <ActionButton
              action="foul"
              label="FOUL"
              sub="1/Turn"
              disabled={!canFoul}
              color="purple"
            />

            {/* Contextual */}
            {isProne && (
              <ActionButton
                action="standUp"
                label="STAND UP"
                sub="3 MA"
                disabled={!canStandUp}
                color="blue"
              />
            )}

            {/* Other */}
            <ActionButton
              action="secureBall"
              label="SECURE BALL"
              sub="Pick Up"
              disabled={!canMove}
              color="blue"
            />
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
    </div>
  );
};
