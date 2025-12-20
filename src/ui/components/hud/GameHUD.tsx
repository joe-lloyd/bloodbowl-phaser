import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { TurnIndicator } from "./TurnIndicator";
import { EndTurnButton } from "./EndTurnButton";
import { NotificationFeed } from "./NotificationFeed";
import { GamePhase } from "../../../types/GameState";

import { CoinFlipOverlay } from "./CoinFlipOverlay";
import { SetupControls } from "./SetupControls";
import { ConfirmationModal } from "./ConfirmationModal";

import { PlayerActionMenu } from "./PlayerActionMenu";
import { DiceLog } from "./DiceLog";
import { PlayerInfoPanel } from "./PlayerInfoPanel";
import { BlockDiceDialog } from "./BlockDiceDialog";
import { FollowUpDialog } from "./FollowUpDialog";
import { TurnoverOverlay } from "./TurnoverOverlay";

interface GameHUDProps {
  eventBus: EventBus;
}

export const GameHUD: React.FC<GameHUDProps> = ({ eventBus }) => {
  // State
  const [turnData, setTurnData] = useState({
    turnNumber: 1,
    activeTeamName: "Loading...",
    isTeam1Active: true,
    phase: GamePhase.SETUP,
    hasBlitzed: false,
    hasPassed: false,
    hasHandedOff: false,
    hasFouled: false,
  });
  const [notifications, setNotifications] = useState<
    { id: string; text: string }[]
  >([]);
  const [queue, setQueue] = useState<{ id: string; text: string }[]>([]);

  // Initial State Load
  useEffect(() => {
    const initHUD = () => {
      try {
        if (!ServiceContainer.isInitialized()) {
          console.log("Waiting for ServiceContainer...");
          setTimeout(initHUD, 100);
          return;
        }

        const container = ServiceContainer.getInstance();
        const state = container.gameService.getState();
        if (state) {
          const activeTeamId = state.activeTeamId || "";
          const activeTeam = container.gameService.getTeam(activeTeamId);
          const team1 =
            container.gameService.getTeam(state.turn.teamId) || activeTeam;

          if (activeTeam) {
            setTurnData({
              turnNumber: state.turn.turnNumber,
              activeTeamName: activeTeam.name,
              isTeam1Active: activeTeamId === (team1?.id || "team1"),
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
  useEventBus(eventBus, "phaseChanged", (data) => {
    setTurnData((prev) => ({ ...prev, phase: data.phase }));
  });

  // Turn started listener
  useEventBus(eventBus, "turnStarted", (turn) => {
    const container = ServiceContainer.getInstance();
    const activeTeam = container.gameService.getTeam(turn.teamId);

    if (activeTeam) {
      // Fetch fresh state to get reset flags
      const state = container.gameService.getState();
      setTurnData({
        turnNumber: turn.turnNumber,
        activeTeamName: activeTeam.name,
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
  useEventBus(eventBus, "turnDataUpdated", (updatedTurn: any) => {
    setTurnData((prev) => ({
      ...prev,
      hasBlitzed: updatedTurn.hasBlitzed,
      hasPassed: updatedTurn.hasPassed,
      hasHandedOff: updatedTurn.hasHandedOff,
      hasFouled: updatedTurn.hasFouled,
    }));
  });

  // Kickoff started listener
  useEventBus(eventBus, "kickoffStarted", () => {
    setTurnData((prev) => ({
      ...prev,
      phase: GamePhase.KICKOFF,
    }));
  });

  useEventBus(eventBus, "ui:notification", (msg) => {
    addNotification(msg);
  });

  // Process queue when notifications change
  useEffect(() => {
    if (notifications.length < 3 && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);

      // Add the next one to notifications
      setNotifications((prev) => [...prev, next]);

      // Set removal timer
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== next.id));
      }, 3000);
    }
  }, [notifications.length, queue]);

  // Helper to add notification
  const addNotification = (text: string) => {
    const id = `${text}-${Date.now()}`;

    setNotifications((prev) => {
      if (prev.length < 3) {
        // If we have space, show immediately
        setTimeout(() => {
          setNotifications((current) => current.filter((n) => n.id !== id));
        }, 3000);
        return [...prev, { id, text }];
      } else {
        // Otherwise add to queue
        setQueue((q) => [...q, { id, text }]);
        return prev;
      }
    });
  };

  const handleEndTurn = () => {
    const container = ServiceContainer.getInstance();
    container.gameService.endTurn();
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-50">
      {/* Top Bar: Turn Indicator */}
      <div className="flex justify-center w-full">
        <TurnIndicator
          turnNumber={turnData.turnNumber}
          activeTeamName={turnData.activeTeamName}
          isTeam1Active={turnData.isTeam1Active}
          phase={turnData.phase}
        />
      </div>

      {/* Overlays */}
      <CoinFlipOverlay eventBus={eventBus} />
      <SetupControls eventBus={eventBus} />
      <ConfirmationModal eventBus={eventBus} />
      <BlockDiceDialog eventBus={eventBus} />
      <FollowUpDialog eventBus={eventBus} />
      <TurnoverOverlay eventBus={eventBus} />

      {/* Player Action Menu (Above Dice Log) */}
      <PlayerActionMenu eventBus={eventBus} turnData={turnData} />

      {/* Dice Log (Bottom Left) */}
      <DiceLog eventBus={eventBus} />

      {/* Player Info Panel (Bottom Right) */}
      <PlayerInfoPanel eventBus={eventBus} />

      {/* Middle: Notifications Overlay - Moved up */}
      <div className="absolute inset-0 flex items-start justify-center pointer-events-none pt-32">
        <NotificationFeed messages={notifications} />
      </div>

      {/* Bottom Bar: End Turn Button */}
      <div className="flex justify-end w-full pb-4 pr-4 pointer-events-auto">
        {turnData.phase === GamePhase.PLAY && (
          <EndTurnButton onClick={handleEndTurn} />
        )}
      </div>
    </div>
  );
};
