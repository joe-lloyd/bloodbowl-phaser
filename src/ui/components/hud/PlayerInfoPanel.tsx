import React, { useState } from "react";
import { Player, PlayerStatus } from "../../../types/Player";
import { useEventBus } from "../../hooks/useEventBus";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";

interface PlayerInfoPanelProps {
  eventBus: EventBus;
}

export const PlayerInfoPanel: React.FC<PlayerInfoPanelProps> = ({
  eventBus,
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [hoveredPlayer, setHoveredPlayer] = useState<Player | null>(null);

  // Hover Events
  useEventBus(eventBus, GameEventNames.UI_ShowPlayerInfo, (player: Player) => {
    setHoveredPlayer(player);
  });

  useEventBus(eventBus, GameEventNames.UI_HidePlayerInfo, () => {
    setHoveredPlayer(null);
  });

  // Selection Events
  // Note: We use 'playerSelected' from GameEvents (emitted by Controller)
  // Payload is { player: Player } or { player: null } for deselect (via our manual emission in Deselect)
  // Verify event payload structure in Controller!
  useEventBus(
    eventBus,
    GameEventNames.PlayerSelected,
    (data: { player: Player | null }) => {
      setSelectedPlayer(data.player);
    }
  );

  // Logic:
  // 1. If Selected exists, it is ALWAYS shown (Bottom Right 1).
  // 2. If Hovered exists AND Hovered != Selected, it is shown as COMPARING (Bottom Right 2 - Stacked above).
  // 3. If NO Selected, Hovered is shown normally (Bottom Right 1).

  const renderPanel = (player: Player, isComparison: boolean) => {
    // Offset comparison panel vertically
    const bottomOffset = isComparison ? "220px" : "1rem";
    // If NO selected player, the hovered player sits at bottom (1rem).
    // If Selected player exists, it sits at 1rem. Comparison sits above it.

    let positionStyle: React.CSSProperties = { bottom: "1rem", right: "1rem" };

    if (selectedPlayer) {
      if (player.id === selectedPlayer.id) {
        // The Selected Panel
        positionStyle = { bottom: "1rem", right: "1rem" };
      } else {
        // The Comparison Panel (Hovered)
        positionStyle = { bottom: "16rem", right: "1rem" }; // adjust height based on panel size (~200px?)
      }
    } else {
      // Just Hovered, no selection
      positionStyle = { bottom: "1rem", right: "1rem" };
    }

    const borderColor = isComparison ? "border-yellow-400" : "border-white";
    const titleColor = isComparison ? "text-yellow-400" : "text-white";

    return (
      <div
        key={player.id}
        className="absolute z-50 pointer-events-none transition-all duration-200"
        style={{ ...positionStyle, width: "17%" }}
      >
        <div
          className={`bg-[#2a2a3e]/95 border-2 ${borderColor} rounded-lg p-3 shadow-lg text-white`}
        >
          {/* Header */}
          <div className="mb-2 border-b border-gray-600 pb-2">
            <div className={`text-lg font-bold ${titleColor} leading-tight`}>
              {isComparison && (
                <span className="text-xs block text-gray-400 mb-1">
                  COMPARING
                </span>
              )}
              #{player.number} {player.playerName}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {player.positionName}
              {player.level > 1 && ` • Lvl ${player.level}`}
              {player.spp > 0 && ` • ${player.spp} SPP`}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="flex justify-between mb-3 px-1">
            <StatItem label="MA" value={player.stats.MA} />
            <StatItem label="ST" value={player.stats.ST} />
            <StatItem label="AG" value={player.stats.AG} />
            <StatItem label="PA" value={player.stats.PA} />
            <StatItem label="AV" value={player.stats.AV} />
          </div>

          {/* Skills */}
          <div className="mb-1">
            <span className="text-xs font-bold text-green-400 block mb-0.5">
              Skills
            </span>
            <div className="text-xs text-green-300 leading-snug">
              {player.skills.length > 0
                ? player.skills.map((s) => s.type).join(", ")
                : "No skills"}
            </div>
          </div>

          {/* Status (if not active) */}
          {player.status !== PlayerStatus.ACTIVE && (
            <div className="mt-2 pt-2 border-t border-gray-600">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                {player.status}
              </span>
              {player.injuries.length > 0 && (
                <span className="text-xs text-red-300 block">
                  {player.injuries.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Helper to format stats with labels matching the original style
  const StatItem = ({ label, value }: { label: string; value: number }) => (
    <div className="flex flex-col items-center">
      <span className="text-xs text-gray-400 font-bold">{label}</span>
      <span className="text-sm text-yellow-300 font-bold">{value}</span>
    </div>
  );

  return (
    <>
      {selectedPlayer && renderPanel(selectedPlayer, false)}
      {hoveredPlayer &&
        hoveredPlayer.id !== selectedPlayer?.id &&
        renderPanel(hoveredPlayer, true)}
    </>
  );
};
