import { PushChoicePrompt } from "./PushChoicePrompt";
import { BiteTargetPrompt } from "./BiteTargetPrompt";
import React, { useState, useEffect } from "react";
import type { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { TurnCatchUpCard } from "./TurnCatchUpCard";
import { HalfTimeCard } from "./HalfTimeCard";
import { TurnIndicator } from "./TurnIndicator";
import { MatchStrip } from "./MatchStrip";
import { ScoreBoard } from "./ScoreBoard";
import { EndTurnButton } from "./EndTurnButton";
import { KeyList } from "./KeyList";
import { Announcer } from "./Announcer";
import { GamePhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";

import { CoinFlipOverlay } from "./CoinFlipOverlay";
import { WeatherOverlay } from "./WeatherOverlay";
import { RollBanner } from "./RollBanner";
import { KickoffTableDialog } from "./KickoffTableDialog";
import { SetupControls } from "./SetupControls";
import { TargetRollPreview } from "./RollPreviews";
import { ConfirmationModal } from "./ConfirmationModal";

import { PlayerActionMenu } from "./PlayerActionMenu";
import { DiceLog } from "./DiceLog";
import { PlayerInfoPanel } from "./PlayerInfoPanel";
import { BlockDiceDialog } from "./BlockDiceDialog";
import { FollowUpDialog } from "./FollowUpDialog";
import { RerollDialog } from "./RerollDialog";
import { ReactionDialog } from "./ReactionDialog";
import { SentOffCard } from "./SentOffCard";
import { FoulAssistsDialog } from "./FoulAssistsDialog";
import { ApothecaryDialog } from "./ApothecaryDialog";
import { InducementChoiceDialog } from "./InducementChoiceDialog";
import { InterceptionDialog } from "./InterceptionDialog";
import { TurnoverOverlay } from "./TurnoverOverlay";
import { OtherCoachPrompt } from "./OtherCoachPrompt";
import { HUDLayout } from "./HUDLayout";
import { MovePlanBar, PhoneNotice } from "./MovePlanBar";
import { ActionPlanCard } from "./ActionPlanCard";
import { FullscreenButton } from "./FullscreenButton";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { PHONE_QUERY } from "../../../game/presentation/phoneLayout";
import { DiceTray } from "./DiceTray";
import { SandboxOverlay } from "./SandboxOverlay";
import { SoundToggle } from "./SoundToggle";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { MatchResultsScreen } from "./MatchResultsScreen";
import { useNavigate } from "react-router-dom";
import { type CompetitionContext } from "../../../competition/types";
import { clearMatchSave } from "../../../game/persistence/MatchSaveRepository";
import { KickoffEventOverlay } from "./KickoffEventOverlay";
import { MatchOptionsMenu } from "./MatchOptionsMenu";
import {
  computeMatchOptionsMenu,
  type MatchOptionsMenuActionId,
  type MatchOptionsMenuContext,
  type MatchOptionsMenuEntry,
} from "./computeMatchOptionsMenu";
import type { ConnectionState } from "../../../firebase/lobby";

const DECISION_DOCK = {
  OtherCoachPrompt,
  BlockDiceDialog,
  PushChoicePrompt,
  FollowUpDialog,
  RerollDialog,
  ReactionDialog,
  SentOffCard,
  FoulAssistsDialog,
  BiteTargetPrompt,
  ApothecaryDialog,
  InducementChoiceDialog,
  InterceptionDialog,
  ConfirmationModal,
};

export interface OnlineMatchMenuProps {
  role: "host" | "guest";
  opponentName: string;
  connection: ConnectionState;
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
  onlineMenu?: OnlineMatchMenuProps;

  leaveTo?: string;
  fixtureContext?: CompetitionContext;
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
  onlineMenu,
  leaveTo,
  fixtureContext,
}) => {
  const navigate = useNavigate();
  const phone = useMediaQuery(PHONE_QUERY);

  const [drawer, setDrawer] = useState<"log" | "sandbox" | null>(null);
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

  useEventBus(eventBus, GameEventNames.PhaseChanged, (data) => {
    setTurnData((prev) => ({ ...prev, phase: data.phase }));
  });

  const showTurn = (turn: { teamId: string; turnNumber: number }) => {
    const container = ServiceContainer.getInstance();
    const activeTeam = container.gameService.getTeam(turn.teamId);

    if (activeTeam) {
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
  };
  useEventBus(eventBus, GameEventNames.TurnStarted, showTurn);
  useEventBus(eventBus, GameEventNames.GameStateRestored, (state) => {
    showTurn(state.turn);
  });

  useEventBus(eventBus, GameEventNames.TurnDataUpdated, (updatedTurn) => {
    setTurnData((prev) => ({
      ...prev,
      hasBlitzed: updatedTurn.hasBlitzed,
      hasPassed: updatedTurn.hasPassed,
      hasHandedOff: updatedTurn.hasHandedOff,
      hasFouled: updatedTurn.hasFouled,
    }));
  });

  useEventBus(eventBus, GameEventNames.KickoffStarted, () => {
    setTurnData((prev) => ({
      ...prev,
      phase: GamePhase.KICKOFF,
    }));
  });

  const handleEndTurn = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    const container = ServiceContainer.getInstance();
    container.gameService.endTurn();
  };

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
        : {
            kind: "local",
            matchOver: turnData.phase === GamePhase.GAME_OVER,
          };

  const menuEntries: MatchOptionsMenuEntry[] = [
    ...computeMatchOptionsMenu(menuContext),
    { type: "panel", id: "sound-settings", render: () => <SoundToggle /> },
    { type: "panel", id: "keys", render: () => <KeyList /> },
  ];

  const reportMenuActionFailed = (error: unknown) => {
    console.error("[MatchOptionsMenu] action failed:", error);
    eventBus.emit(
      GameEventNames.UI_Notification,
      "That didn't go through — you're still in the match. Try again."
    );
  };

  const menuActions: Record<MatchOptionsMenuActionId, () => void> = {
    "exit-sandbox": () => navigate("/"),
    "return-to-menu": () => navigate("/"),
    "abandon-match": () => {
      navigate("/");
      clearMatchSave();
    },
    "save-and-exit": () => onlineMenu?.onSaveAndExit(),
    "leave-match": () => onlineMenu?.onSaveAndExit(),
    "request-end-match": () => onlineMenu?.onRequestEndMatch(),
    "cancel-end-match": () => onlineMenu?.onCancelEndMatch(),
    "force-abandon": () => onlineMenu?.onForceAbandon(),
    reconnect: () => onlineMenu?.onReconnect(),
    "respond-end-match": () => {},
    "connection-status": () => {},
  };

  const handleMenuSelect = (id: MatchOptionsMenuActionId) => {
    try {
      menuActions[id]();
    } catch (error) {
      reportMenuActionFailed(error);
    }
  };

  const decisionDock = (
    <div
      data-testid="decision-dock"
      className="w-full max-h-[calc(100dvh-3rem)] overflow-y-auto hud-scroll empty:hidden [&>[data-decision-dialog]:not(:last-child)]:hidden"
    >
      {Object.entries(DECISION_DOCK).map(([name, Dialog]) => (
        <Dialog key={name} eventBus={eventBus} />
      ))}
    </div>
  );

  const takeovers = (
    <>
      <DiceTray eventBus={eventBus} />
      <RollBanner eventBus={eventBus} />

      <WeatherOverlay eventBus={eventBus} />
      <KickoffTableDialog eventBus={eventBus} />
      <CoinFlipOverlay eventBus={eventBus} />

      {!phone && <TargetRollPreview eventBus={eventBus} />}
      <TurnoverOverlay eventBus={eventBus} />
      <MatchResultsScreen
        visible={turnData.phase === GamePhase.GAME_OVER}
        {...(leaveTo === undefined ? {} : { leaveTo: leaveTo })}
        {...(fixtureContext === undefined
          ? {}
          : { fixtureContext: fixtureContext })}
      />

      <Announcer eventBus={eventBus} showHalftime={false} />
    </>
  );

  const phoneBarButton =
    "hud-slab flex h-11 items-center px-3 font-hud-label text-hud-sm font-bold uppercase tracking-[0.08em] text-hud-bone aria-expanded:border-hud-gold aria-expanded:text-hud-gold";

  if (phone) {
    return (
      <HUDLayout
        phone
        topLeft={
          <>
            <div
              className={
                drawer === "log"
                  ? "h-[min(60dvh,320px)] w-full shrink-0"
                  : "hidden"
              }
            >
              <DiceLog eventBus={eventBus} />
            </div>
            <HalfTimeCard eventBus={eventBus} />
            <TurnCatchUpCard eventBus={eventBus} />
          </>
        }
        topRight={
          <>
            {mode === "sandbox" && (
              <div className={drawer === "sandbox" ? "w-full" : "hidden"}>
                <SandboxOverlay eventBus={eventBus} />
              </div>
            )}
            <KickoffEventOverlay eventBus={eventBus} />
          </>
        }
        bottomLeft={<PlayerInfoPanel eventBus={eventBus} phone />}
        bottomRight={
          <>
            <SetupControls eventBus={eventBus} compact />
            <div className="flex w-full min-h-0 flex-col items-end [&:has([data-decision-dialog])_.decision-actions]:hidden">
              {decisionDock}
              <div className="decision-actions flex w-[112px] flex-col gap-2">
                <PlayerActionMenu
                  eventBus={eventBus}
                  turnData={turnData}
                  compact
                />
                <EndTurnButton
                  phase={turnData.phase}
                  activeTeamId={turnData.activeTeamId}
                  onClick={handleEndTurn}
                  hold
                />
              </div>
            </div>
          </>
        }
        overlays={
          <>
            <div
              className="absolute z-50 flex gap-2 pointer-events-auto"
              style={{
                top: "calc(env(safe-area-inset-top) + 8px)",
                left: "calc(env(safe-area-inset-left) + 8px)",
              }}
              data-hud-panels=""
            >
              <MatchOptionsMenu
                compact
                entries={menuEntries}
                onSelect={handleMenuSelect}
              />
              <button
                type="button"
                data-testid="dice-log-toggle"
                aria-expanded={drawer === "log"}
                onClick={() => {
                  setDrawer(drawer === "log" ? null : "log");
                }}
                className={phoneBarButton}
              >
                Log
              </button>
            </div>
            <div
              className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center pointer-events-none z-50"
              style={{ top: "calc(env(safe-area-inset-top) + 6px)" }}
              data-hud-panels=""
              data-hud-frame="top"
            >
              <ScoreBoard eventBus={eventBus} compact />
              <MatchStrip eventBus={eventBus}>
                <TurnIndicator
                  turnNumber={turnData.turnNumber}
                  phase={turnData.phase}
                />
              </MatchStrip>
            </div>
            <div
              className="absolute z-50 flex gap-2 pointer-events-auto"
              style={{
                top: "calc(env(safe-area-inset-top) + 8px)",
                right: "calc(env(safe-area-inset-right) + 8px)",
              }}
              data-hud-panels=""
            >
              {mode === "sandbox" && (
                <button
                  type="button"
                  data-testid="sandbox-toggle"
                  aria-expanded={drawer === "sandbox"}
                  onClick={() => {
                    setDrawer(drawer === "sandbox" ? null : "sandbox");
                  }}
                  className={phoneBarButton}
                >
                  Scenario
                </button>
              )}
              <FullscreenButton />
            </div>
            <div
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-40"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
            >
              <PhoneNotice eventBus={eventBus} />
            </div>
            <div
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-40"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
              data-hud-panels=""
            >
              <MovePlanBar
                eventBus={eventBus}
                phase={turnData.phase}
                activeTeamId={turnData.activeTeamId}
              />
            </div>
            {takeovers}
          </>
        }
      />
    );
  }

  return (
    <HUDLayout
      topLeft={
        <>
          <HalfTimeCard eventBus={eventBus} />
          <TurnCatchUpCard eventBus={eventBus} />
        </>
      }
      topRight={
        <>
          <div className="pointer-events-auto">
            <MatchOptionsMenu
              entries={menuEntries}
              onSelect={handleMenuSelect}
            />
          </div>
          {mode === "sandbox" && <SandboxOverlay eventBus={eventBus} />}
          <KickoffEventOverlay eventBus={eventBus} />
        </>
      }
      bottomLeft={
        <>
          <PlayerInfoPanel eventBus={eventBus} />
          <div className="h-[22vh] max-h-[220px] min-h-[120px] w-full shrink-0">
            <DiceLog eventBus={eventBus} />
          </div>
        </>
      }
      bottomRight={
        <>
          <SetupControls eventBus={eventBus} />
          <div className="w-full min-h-0 [&:has([data-decision-dialog])_.decision-actions]:hidden">
            {decisionDock}
            <div className="decision-actions flex w-full flex-col gap-3">
              <ActionPlanCard eventBus={eventBus} />
              <PlayerActionMenu eventBus={eventBus} turnData={turnData} />
              <EndTurnButton
                phase={turnData.phase}
                activeTeamId={turnData.activeTeamId}
                onClick={handleEndTurn}
              />
            </div>
          </div>
        </>
      }
      overlays={
        <>
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-50 flex flex-col items-center"
            data-hud-panels=""
            data-hud-frame="top"
          >
            <ScoreBoard eventBus={eventBus} />
            <MatchStrip eventBus={eventBus}>
              <TurnIndicator
                turnNumber={turnData.turnNumber}
                phase={turnData.phase}
              />
            </MatchStrip>
          </div>

          {takeovers}
        </>
      }
    />
  );
};
