import React, { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { Player, PlayerStatus } from "../../../types/Player";
import { ActionType } from "../../../types/events";

interface PlayerActionMenuProps {
  eventBus: EventBus;
  turnData: any; // Typed as TurnData in real code
}

export const PlayerActionMenu: React.FC<PlayerActionMenuProps> = ({
  eventBus,
  turnData,
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Listen for player selection
  useEventBus(eventBus, "playerSelected", (data) => {
    setSelectedPlayer(data.player);
  });

  useEventBus(eventBus, "turnStarted", () => {
    setSelectedPlayer(null);
  });

  if (!selectedPlayer) return null;

  const handleAction = (action: ActionType) => {
    if (selectedPlayer) {
      eventBus.emit("ui:actionSelected", {
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
  const canBlock = canMove; // Adjacent check?
  const canStandUp = isProne && !hasActed && !isStunned;

  // Render Helper
  const ActionButton = ({
    action,
    label,
    sub,
    disabled,
    color = "blue",
  }: any) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        handleAction(action);
      }}
      disabled={disabled}
      className={`
                group relative w-full px-3 py-2 border-2 rounded transition-all duration-200
                flex flex-col items-start mb-1
                ${
                  disabled
                    ? "bg-gray-700 border-gray-600 opacity-50 cursor-not-allowed"
                    : `bg-${color}-900 border-${color}-700 hover:bg-${color}-800 hover:border-${color}-500 cursor-pointer shadow-md hover:shadow-lg hover:-translate-y-0.5`
                }
            `}
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

  return (
    <div
      className="absolute bottom-[25%] left-4 w-[18%] max-h-[60vh] flex flex-col pointer-events-auto animate-fade-in z-50"
      style={{ pointerEvents: "auto", zIndex: 9999 }}
      onClick={(e) => {
        console.log("[PlayerActionMenu] Container Clicked");
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
      onPointerDown={(e) => {
        console.log("[PlayerActionMenu] Container PointerDown");
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
      onMouseDown={(e) => {
        console.log("[PlayerActionMenu] Container MouseDown");
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

      {/* Menu Body - Scrollable */}
      <div className="bg-bb-parchment border-2 border-bb-gold p-2 rounded-b-md shadow-lg flex flex-col overflow-y-auto max-h-[50vh] scrollbar-thin scrollbar-thumb-bb-gold">
        {/* Actions Grid */}
        <div className="space-y-1">
          {/* Basic Actions */}
          {canMove && (
            <ActionButton
              action="move"
              label="MOVE"
              sub="MA + Sprint"
              color="green"
            />
          )}
          {canBlock && (
            <ActionButton
              action="block"
              label="BLOCK"
              sub="Adjacent"
              color="red"
            />
          )}

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
    </div>
  );
};
