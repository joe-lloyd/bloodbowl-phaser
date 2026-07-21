import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { TurnIndicator } from "./TurnIndicator";
import { ScoreBoard } from "./ScoreBoard";
import { EndTurnButton } from "./EndTurnButton";
import { NotificationFeed } from "./NotificationFeed";
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
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";

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

  const [notifications, setNotifications] = useState<
    { id: string; text: string }[]
  >([]);
  const [queue, setQueue] = useState<{ id: string; text: string }[]>([]);
  // De-dup identical messages arriving close together. Online, a notification
  // derived from a game event can arrive twice on the peer — once as the
  // host's broadcast UI_Notification and once re-derived locally from the
  // re-emitted event. Same text within a short window is treated as one.
  const recentNotifRef = React.useRef<Map<string, number>>(new Map());

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

  useEventBus(eventBus, GameEventNames.UI_Notification, (msg) => {
    addNotification(msg);
  });

  // Process queue when notifications change
  useEffect(() => {
    if (notifications.length < 3 && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);

      setNotifications((prev) => [...prev, next]);

      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== next.id));
      }, 3000);
    }
  }, [notifications.length, queue]);

  const DEDUP_WINDOW_MS = 1500;

  const addNotification = (text: string) => {
    const now = Date.now();
    const recent = recentNotifRef.current;
    // Drop an identical message seen within the window (duplicate suppression)
    if (recent.has(text) && now - (recent.get(text) ?? 0) < DEDUP_WINDOW_MS) {
      return;
    }
    recent.set(text, now);
    // Keep the dedup map small
    if (recent.size > 20) {
      for (const [k, t] of recent) {
        if (now - t > DEDUP_WINDOW_MS) recent.delete(k);
      }
    }

    const id = `${text}-${now}`;
    setNotifications((prev) => {
      if (prev.length < 3) {
        setTimeout(() => {
          setNotifications((current) => current.filter((n) => n.id !== id));
        }, 3000);
        return [...prev, { id, text }];
      } else {
        setQueue((q) => [...q, { id, text }]);
        return prev;
      }
    });
  };

  const handleEndTurn = () => {
    // Online: only the active coach may end their turn
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    const container = ServiceContainer.getInstance();
    container.gameService.endTurn();
  };

  return (
    <HUDLayout
      left={
        <div className="flex flex-1 flex-col space-between w-full gap-4">
          <ScoreBoard eventBus={eventBus} />
          <EndTurnButton phase={turnData.phase} onClick={handleEndTurn} />
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

          {/* Full-screen overlays */}
          <CoinFlipOverlay eventBus={eventBus} />
          <ConfirmationModal eventBus={eventBus} />
          <BlockDiceDialog eventBus={eventBus} />
          <FollowUpDialog eventBus={eventBus} />
          <RerollDialog eventBus={eventBus} />
          <ReactionDialog eventBus={eventBus} />
          <InterceptionDialog eventBus={eventBus} />
          <TurnoverOverlay eventBus={eventBus} />

          {/* Notification overlay — bottom-center, out of the board's way,
              capped at 3 with de-duplication (see addNotification). */}
          <div className="absolute inset-x-0 bottom-6 flex items-end justify-center pointer-events-none z-50">
            <NotificationFeed messages={notifications} />
          </div>
        </>
      }
    />
  );
};
