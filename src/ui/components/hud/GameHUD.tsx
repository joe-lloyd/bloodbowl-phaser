import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { TurnIndicator } from "./TurnIndicator";
import { ScoreBoard } from "./ScoreBoard";
import { EndTurnButton } from "./EndTurnButton";
import { Announcer } from "./Announcer";
import { GamePhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";

import { CoinFlipOverlay } from "./CoinFlipOverlay";
import { SetupControls } from "./SetupControls";
import { ConfirmationModal } from "./ConfirmationModal";

import { PlayerActionMenu } from "./PlayerActionMenu";
import { DiceLog } from "./DiceLog";
import { PlayerInfoPanel } from "./PlayerInfoPanel";
import { BlockDiceDialog } from "./BlockDiceDialog";
import { FollowUpDialog } from "./FollowUpDialog";
import { RerollDialog } from "./RerollDialog";
import { ReactionDialog } from "./ReactionDialog";
import { InterceptionDialog } from "./InterceptionDialog";
import { TurnoverOverlay } from "./TurnoverOverlay";
import { HUDLayout } from "./HUDLayout";
import { SandboxOverlay } from "./SandboxOverlay";
import { SoundToggle } from "./SoundToggle";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { MatchResultsScreen } from "./MatchResultsScreen";
import { useNavigate } from "react-router-dom";
import { clearMatchSave } from "../../../game/persistence/MatchSaveRepository";
import { KickoffEventOverlay } from "./KickoffEventOverlay";

interface GameHUDProps {
  eventBus: EventBus;
  mode?: "normal" | "sandbox";
}

interface TurnData {
  turnNumber: number | null;
  activeTeamName: string | null;
  activeTeamId: string | null;
  isTeam1Active: boolean | null;
  phase: GamePhase;
  hasBlitzed: boolean | null;
  hasPassed: boolean | null;
  hasHandedOff: boolean | null;
  hasFouled: boolean | null;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  eventBus,
  mode = "normal",
}) => {
  const navigate = useNavigate();
  const [turnData, setTurnData] = useState<TurnData>({
    turnNumber: null,
    activeTeamName: null,
    activeTeamId: null,
    isTeam1Active: null,
    phase: mode === "normal" ? GamePhase.SETUP : GamePhase.SANDBOX_IDLE,
    hasBlitzed: null,
    hasPassed: null,
    hasHandedOff: null,
    hasFouled: null,
  });

  useEffect(() => {
    const initHUD = () => {
      try {
        if (!ServiceContainer.isInitialized()) {
          setTimeout(initHUD, 100);
          return;
        }

        const container = ServiceContainer.getInstance();
        const state = container.gameService.getState();
        if (state) {
          const activeTeamId = state.activeTeamId;
          const activeTeam =
            activeTeamId !== null
              ? container.gameService.getTeam(activeTeamId)
              : null;
          const team1 =
            container.gameService.getTeam(state.turn.teamId) || activeTeam;

          if (activeTeam) {
            setTurnData({
              turnNumber: state.turn.turnNumber,
              activeTeamName: activeTeam.name,
              activeTeamId: activeTeam.id,
              isTeam1Active: activeTeamId === team1?.id,
              phase: state.phase,
              hasBlitzed: state.turn.hasBlitzed,
              hasPassed: state.turn.hasPassed,
              hasHandedOff: state.turn.hasHandedOff,
              hasFouled: state.turn.hasFouled,
            });
          }
        }
      } catch (e) {
        console.error("GameService not ready yet, retrying...", e);
        setTimeout(initHUD, 200);
      }
    };

    initHUD();
  }, []);

  // Phase change listener
  useEventBus(eventBus, GameEventNames.PhaseChanged, (data) => {
    setTurnData((prev) => ({ ...prev, phase: data.phase }));
  });

  // Turn started listener
  useEventBus(eventBus, GameEventNames.TurnStarted, (turn) => {
    const container = ServiceContainer.getInstance();
    const activeTeam = container.gameService.getTeam(turn.teamId);

    if (activeTeam) {
      // Fetch fresh state to get reset flags
      const state = container.gameService.getState();
      setTurnData({
        turnNumber: turn.turnNumber,
        activeTeamName: activeTeam.name,
        activeTeamId: activeTeam.id,
        isTeam1Active: turn.teamId === "team1",
        phase: state.phase,
        hasBlitzed: state.turn.hasBlitzed,
        hasPassed: state.turn.hasPassed,
        hasHandedOff: state.turn.hasHandedOff,
        hasFouled: state.turn.hasFouled,
      });
    }
  });

  // Turn Data Updated listener (from PlayerActionManager)
  useEventBus(eventBus, GameEventNames.TurnDataUpdated, (updatedTurn) => {
    setTurnData((prev) => ({
      ...prev,
      hasBlitzed: updatedTurn.hasBlitzed,
      hasPassed: updatedTurn.hasPassed,
      hasHandedOff: updatedTurn.hasHandedOff,
      hasFouled: updatedTurn.hasFouled,
    }));
  });

  // Kickoff started listener
  useEventBus(eventBus, GameEventNames.KickoffStarted, () => {
    setTurnData((prev) => ({
      ...prev,
      phase: GamePhase.KICKOFF,
    }));
  });

  const handleEndTurn = () => {
    // Online: only the active coach may end their turn
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    const container = ServiceContainer.getInstance();
    container.gameService.endTurn();
  };

  const leaveLocalMatch = () => {
    if (
      turnData.phase !== GamePhase.GAME_OVER &&
      !window.confirm(
        "Abandon this local match and discard its saved progress?"
      )
    ) {
      return;
    }
    clearMatchSave();
    navigate("/");
  };

  return (
    <HUDLayout
      left={
        <div className="flex flex-1 flex-col space-between w-full gap-4">
          <ScoreBoard eventBus={eventBus} />
          <EndTurnButton phase={turnData.phase} onClick={handleEndTurn} />
          {mode === "normal" && !getActiveOnlineMatch() && (
            <button
              onClick={leaveLocalMatch}
              className="rounded border border-bb-dark-gold bg-bb-deep-crimson
                px-3 py-2 font-heading uppercase text-bb-parchment"
            >
              {turnData.phase === GamePhase.GAME_OVER
                ? "Leave results"
                : "Abandon match"}
            </button>
          )}
          <div className="flex flex-1 flex-col gap-4 w-full">
            <SetupControls eventBus={eventBus} />
            <PlayerActionMenu eventBus={eventBus} turnData={turnData} />
          </div>
          <DiceLog eventBus={eventBus} />
        </div>
      }
      right={
        <>
          {mode === "sandbox" && <SandboxOverlay eventBus={eventBus} />}
          <PlayerInfoPanel eventBus={eventBus} />
          <KickoffEventOverlay eventBus={eventBus} />
        </>
      }
      overlays={
        <>
          {/* Turn Indicator - Top Center */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-50">
            <TurnIndicator
              turnNumber={turnData.turnNumber}
              phase={turnData.phase}
            />
          </div>

          {/* Sound mute/volume - Top Right */}
          <div className="absolute top-4 right-4 z-50">
            <SoundToggle />
          </div>

          {/* Full-screen overlays */}
          <CoinFlipOverlay eventBus={eventBus} />
          <ConfirmationModal eventBus={eventBus} />
          <BlockDiceDialog eventBus={eventBus} />
          <FollowUpDialog eventBus={eventBus} />
          <RerollDialog eventBus={eventBus} />
          <ReactionDialog eventBus={eventBus} />
          <InterceptionDialog eventBus={eventBus} />
          <TurnoverOverlay eventBus={eventBus} />
          <MatchResultsScreen
            visible={turnData.phase === GamePhase.GAME_OVER}
          />

          {/* Structural-transition announcer: turn started, round passed,
              halftime, full time — a single centred takeover, not a feed. */}
          <Announcer eventBus={eventBus} />
        </>
      }
    />
  );
};
