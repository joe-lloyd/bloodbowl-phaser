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
import { ApothecaryDialog } from "./ApothecaryDialog";
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
import { InducementSelectionPanel } from "./InducementSelectionPanel";
import { MatchOptionsMenu } from "./MatchOptionsMenu";
import {
  computeMatchOptionsMenu,
  MatchOptionsMenuActionId,
  MatchOptionsMenuContext,
} from "./computeMatchOptionsMenu";
import type { OpponentConnectionState } from "../../../firebase/lobby";

/** Online-only entries/state, supplied by OnlinePlayPage (GamePage forwards
 *  it through untouched — GameHUD has no lobby access of its own). */
export interface OnlineMatchMenuProps {
  role: "host" | "guest";
  opponentName: string;
  connection: OpponentConnectionState;
  endRequest: "none" | "mine" | "theirs";
  onSaveAndExit: () => void;
  onRequestEndMatch: () => void;
  onCancelEndMatch: () => void;
  onForceAbandon: () => void;
  onReconnect: () => void;
}

interface GameHUDProps {
  eventBus: EventBus;
  mode?: "normal" | "sandbox";
  /**
   * Show the pre-match Sevens inducement selection panel before setup. Off
   * by default so existing local/sandbox/competition flows are unaffected
   * until a caller opts in (see GameService.getOrCreateInducementSession,
   * which currently always resolves the non-Advanced-League Sevens profile
   * — Advanced League is a per-team/competition setting introduced by the
   * sibling add-team-advancement-modes change and not yet threaded here).
   */
  sevensInducementsEnabled?: boolean;
  onlineMenu?: OnlineMatchMenuProps;
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
  sevensInducementsEnabled = false,
  onlineMenu,
}) => {
  const [inducementsPending, setInducementsPending] = useState(
    () =>
      sevensInducementsEnabled &&
      ServiceContainer.isInitialized() &&
      !ServiceContainer.getInstance().gameService.getState().inducements
  );
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

  // Context-derived menu: recomputed every render so enabled state (e.g. an
  // opponent reconnecting, or an end-match request landing) always reflects
  // the live match/connection state rather than a stale snapshot taken when
  // the menu was opened.
  const menuContext: MatchOptionsMenuContext =
    mode === "sandbox"
      ? { kind: "sandbox" }
      : onlineMenu
        ? {
            kind: "online",
            role: onlineMenu.role,
            opponentName: onlineMenu.opponentName,
            connection: onlineMenu.connection,
            endRequest: onlineMenu.endRequest,
          }
        : { kind: "local", matchOver: turnData.phase === GamePhase.GAME_OVER };

  const menuEntries = computeMatchOptionsMenu(menuContext);

  // A failure here must never strand the coach mid-match with their state
  // silently discarded (e.g. a save cleared but the navigate away throwing) —
  // report it and leave them exactly where they were, free to retry.
  const reportMenuActionFailed = (error: unknown) => {
    console.error("[MatchOptionsMenu] action failed:", error);
    eventBus.emit(
      GameEventNames.UI_Notification,
      "That didn't go through — you're still in the match. Try again."
    );
  };

  const handleMenuSelect = (id: MatchOptionsMenuActionId) => {
    try {
      switch (id) {
        case "exit-sandbox":
        case "return-to-menu":
          navigate("/");
          return;
        case "abandon-match":
          // Navigate first: if leaving the page fails for any reason, the
          // save is still intact and the match still resumable.
          navigate("/");
          clearMatchSave();
          return;
        case "save-and-exit":
        case "leave-match":
          onlineMenu?.onSaveAndExit();
          return;
        case "request-end-match":
          onlineMenu?.onRequestEndMatch();
          return;
        case "cancel-end-match":
          onlineMenu?.onCancelEndMatch();
          return;
        case "force-abandon":
          onlineMenu?.onForceAbandon();
          return;
        case "reconnect":
          onlineMenu?.onReconnect();
          return;
        default:
          return;
      }
    } catch (error) {
      reportMenuActionFailed(error);
    }
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
          <KickoffEventOverlay eventBus={eventBus} />
          <PlayerInfoPanel eventBus={eventBus} />
          <div className="mt-auto pointer-events-auto">
            <MatchOptionsMenu
              entries={menuEntries}
              onSelect={handleMenuSelect}
            />
          </div>
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
          <ApothecaryDialog eventBus={eventBus} />
          <InterceptionDialog eventBus={eventBus} />
          {inducementsPending && (
            <InducementSelectionPanel
              onDone={() => setInducementsPending(false)}
            />
          )}
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
