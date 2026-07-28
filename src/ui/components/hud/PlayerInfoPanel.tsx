import React, { useRef, useState } from "react";
import { Player, PlayerStatus } from "../../../types/Player";
import { useEventBus } from "../../hooks/useEventBus";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames, InfoPanelSubject } from "../../../types/events";
import { GamePhase } from "../../../types/GameState";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  effectiveAV,
  effectiveMA,
  getDriveEffects,
} from "../../../game/kickoff/driveEffects";
import { SidelineCrewInfo } from "../../../game/presentation/sidelineStaff";

interface PlayerInfoPanelProps {
  eventBus: EventBus;
}

export const PlayerInfoPanel: React.FC<PlayerInfoPanelProps> = ({
  eventBus,
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [hoveredPlayer, setHoveredPlayer] = useState<Player | null>(null);
  const [hoveredCrew, setHoveredCrew] = useState<SidelineCrewInfo | null>(
    null
  );
  const [, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick((tick) => tick + 1);
  // During setup the panel stays on the last inspected player for the whole
  // drag and after the drop, rather than clearing on pointer-out like the
  // transient hover preview does during play.
  const phaseRef = useRef<GamePhase | null>(null);

  useEventBus(eventBus, GameEventNames.PhaseChanged, (data) => {
    phaseRef.current = data.phase;
  });

  // Hover Events
  useEventBus(eventBus, GameEventNames.UI_ShowPlayerInfo, (player: Player) => {
    setHoveredPlayer(player);
    setHoveredCrew(null);
  });

  // A non-player subject (currently only sideline crew) fills the same
  // panel slot as a hovered player, without disturbing the selection.
  useEventBus(
    eventBus,
    GameEventNames.UI_ShowInfo,
    (subject: InfoPanelSubject) => {
      if (subject.kind === "player") {
        setHoveredPlayer(subject.player);
        setHoveredCrew(null);
      } else {
        setHoveredCrew(subject.crew);
        setHoveredPlayer(null);
      }
    }
  );

  useEventBus(eventBus, GameEventNames.UI_HidePlayerInfo, () => {
    if (phaseRef.current === GamePhase.SETUP) return;
    setHoveredPlayer(null);
    setHoveredCrew(null);
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
  useEventBus(eventBus, GameEventNames.DriveEffectGranted, refresh);
  useEventBus(eventBus, GameEventNames.PlayerStatusChanged, refresh);
  useEventBus(eventBus, GameEventNames.GameStateRestored, refresh);

  // Logic (top-to-bottom order: kickoff panel, selected, hovered — see
  // GameHUD.tsx and the container's flex-col below):
  // 1. If Selected exists, it is ALWAYS shown, above any hovered panel.
  // 2. If Hovered exists AND Hovered != Selected, it is shown as COMPARING,
  //    below the selected panel.
  // 3. If NO Selected, Hovered is shown normally in the selected panel's slot.

  const renderPanel = (player: Player, isComparison: boolean) => {
    const borderColor = isComparison ? "border-yellow-400" : "border-white";
    const titleColor = isComparison ? "text-yellow-400" : "text-white";
    const state = ServiceContainer.isInitialized()
      ? ServiceContainer.getInstance().gameService.getState()
      : null;
    const ma = state ? effectiveMA(player, state) : player.stats.MA;
    const av = state ? effectiveAV(player, state) : player.stats.AV;
    const driveModifier = state
      ? getDriveEffects(state).playerModifiers[player.id]
      : undefined;

    return (
      <div
        key={player.id}
        className="w-full pointer-events-none transition-all duration-200 mb-4"
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
            <StatItem label="MA" value={ma} baseValue={player.stats.MA} />
            <StatItem label="ST" value={player.stats.ST} />
            <StatItem label="AG" value={player.stats.AG} />
            <StatItem label="PA" value={player.stats.PA} />
            <StatItem label="AV" value={av} baseValue={player.stats.AV} />
          </div>

          {driveModifier && (
            <div className="mb-2 rounded border border-orange-500/70 bg-orange-950/60 px-2 py-1 text-xs font-bold text-orange-300">
              Dodgy Snack:{" "}
              {driveModifier.confinedToReserves
                ? "confined to Reserves for this drive"
                : `${driveModifier.maModifier ?? 0} MA, ${driveModifier.avModifier ?? 0} AV for this drive`}
            </div>
          )}

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

          {/* Conditions (Distracted, Rooted, ...) — a Standing player can
              still carry one of these, so this is independent of Status */}
          {(player.conditions?.length ?? 0) > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-600">
              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                {player.conditions!.map((c) => c.type).join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // A sideline crew figure (or the NO STAFF placeholder) renders name, its
  // match effect, and the team's real count — no statline, skills, or
  // player status, since it is not a player.
  const renderCrewPanel = (crew: SidelineCrewInfo) => (
    <div
      key="sideline-crew"
      className="w-full pointer-events-none transition-all duration-200 mb-4"
    >
      <div className="bg-[#2a2a3e]/95 border-2 border-yellow-400 rounded-lg p-3 shadow-lg text-white">
        <div className="mb-2 border-b border-gray-600 pb-2">
          <div className="text-lg font-bold text-yellow-400 leading-tight">
            {crew.name}
          </div>
          {crew.type !== null && (
            <div className="text-xs text-gray-400 mt-1">
              {crew.count} on this team
            </div>
          )}
        </div>
        <div className="text-xs text-gray-200 leading-snug">
          {crew.effect}
        </div>
      </div>
    </div>
  );

  // Helper to format stats with labels matching the original style
  const StatItem = ({
    label,
    value,
    baseValue = value,
  }: {
    label: string;
    value: number;
    baseValue?: number;
  }) => (
    <div className="flex flex-col items-center">
      <span className="text-xs text-gray-400 font-bold">{label}</span>
      <span
        className={`text-sm font-bold ${
          value < baseValue ? "text-orange-400" : "text-yellow-300"
        }`}
        title={value < baseValue ? `Base ${baseValue}` : undefined}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="w-full flex flex-col items-end">
      {selectedPlayer && renderPanel(selectedPlayer, false)}
      {hoveredPlayer &&
        hoveredPlayer.id !== selectedPlayer?.id &&
        renderPanel(hoveredPlayer, true)}
      {hoveredCrew && renderCrewPanel(hoveredCrew)}
    </div>
  );
};
