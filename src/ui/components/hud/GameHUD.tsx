import { kickoffTurnOf } from "../../../game/kickoff/kickRecord";
import { PushChoicePrompt } from "./PushChoicePrompt";
import { BiteTargetPrompt } from "./BiteTargetPrompt";
import React, { type ReactNode, useState, useEffect } from "react";
import type { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { TurnCatchUpCard } from "./TurnCatchUpCard";
import { HalfTimeCard } from "./HalfTimeCard";
import { TurnIndicator } from "./TurnIndicator";
import { MatchStrip, WeatherNote } from "./MatchStrip";
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
import type { TurnSpend } from "../../../game/rules/turnSpend";

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

  sandboxPanel?: ReactNode;
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
  spend: TurnSpend | null;
}

const handleEndTurn = () => {
  if (getActiveOnlineMatch()?.mayAct() === false) return;
  const container = ServiceContainer.getInstance();
  container.gameService.endTurn();
};

export const GameHUD: React.FC<GameHUDProps> = ({
  eventBus,
  mode = "normal",
  sandboxPanel = <SandboxOverlay eventBus={eventBus} />,
  onlineMenu,
  leaveTo,
  fixtureContext,
}) => {
  const navigate = useNavigate();
  const phone = useMediaQuery(PHONE_QUERY);

  const [drawer, setDrawer] = useState<"log" | "sandbox" | null>(null);
  const [kickoffTurn, setKickoffTurn] = useState<string | null>(null);
  const [turnData, setTurnData] = useState<TurnData>({
    turnNumber: null,
    activeTeamName: null,
    activeTeamId: null,
    isTeam1Active: null,
    phase: mode === "normal" ? GamePhase.SETUP : GamePhase.SANDBOX_IDLE,
    spend: null,
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
            activeTeamId === null
              ? null
              : container.gameService.getTeam(activeTeamId);
          const team1 =
            container.gameService.getTeam(state.turn.teamId) || activeTeam;

          if (activeTeam) {
            setTurnData({
              turnNumber: state.turn.turnNumber,
              activeTeamName: activeTeam.name,
              activeTeamId: activeTeam.id,
              isTeam1Active: activeTeamId === team1?.id,
              phase: state.phase,
              spend: state.turn.spend,
            });
          }
        }
      } catch (error) {
        console.error("GameService not ready yet, retrying...", error);
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

    if (!activeTeam) return;
    const state = container.gameService.getState();
    setTurnData({
      turnNumber: turn.turnNumber,
      activeTeamName: activeTeam.name,
      activeTeamId: activeTeam.id,
      isTeam1Active: turn.teamId === "team1",
      phase: state.phase,
      spend: state.turn.spend,
    });
  };
  useEventBus(eventBus, GameEventNames.TurnStarted, showTurn);
  const showKickoffTurn = () => {
    const state = ServiceContainer.getInstance().gameService.getState();
    setKickoffTurn(kickoffTurnOf(state)?.event ?? null);
    showTurn(state.turn);
  };
  useEventBus(eventBus, GameEventNames.KickoffTurnStarted, showKickoffTurn);
  useEventBus(eventBus, GameEventNames.KickoffTurnEnded, showKickoffTurn);
  useEventBus(eventBus, GameEventNames.GameStateRestored, (state) => {
    setKickoffTurn(kickoffTurnOf(state)?.event ?? null);
    showTurn(state.turn);
  });

  useEventBus(eventBus, GameEventNames.TurnDataUpdated, (updatedTurn) => {
    setTurnData((prev) => ({
      ...prev,
      spend: updatedTurn.spend,
    }));
  });

  useEventBus(eventBus, GameEventNames.KickoffStarted, () => {
    setTurnData((prev) => ({
      ...prev,
      phase: GamePhase.KICKOFF,
    }));
  });

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

          phone ? {
            type: "panel" as const,
            id: "weather",
            render: () => <WeatherNote />,
          } : { type: "panel" as const, id: "keys", render: () => <KeyList /> }
        ,
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
      {!phone && <RollBanner eventBus={eventBus} />}

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

  if (phone) {
    const phoneBarButton =
    "hud-slab flex h-11 items-center px-3 font-hud-label text-hud-sm font-bold uppercase tracking-[0.08em] text-hud-bone aria-expanded:border-hud-gold aria-expanded:text-hud-gold";
    return (
      <HUDLayout
        phone
        topLeft={
          <>
            <div
              className={
                drawer === "log"
                  ? "h-[min(60dvh,420px)] w-full shrink-0"
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
                {sandboxPanel}
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
              <div className="decision-actions flex w-fit min-w-[112px] flex-col items-end gap-2">
                <PlayerActionMenu
                  eventBus={eventBus}
                  turnData={turnData}
                  compact
                />
                <EndTurnButton
                  phase={turnData.phase}
                  kickoffTurn={kickoffTurn}
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
              className="phone-top-bar pointer-events-none absolute z-50"
              data-hud-panels=""
            >
              <div className="pointer-events-auto flex gap-2">
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
                className="phone-score flex min-w-0 flex-col items-start"
                data-hud-frame="top"
              >
                <ScoreBoard eventBus={eventBus} compact />
                <div className="phone-strip">
                  <MatchStrip eventBus={eventBus}>
                    <TurnIndicator
                      turnNumber={turnData.turnNumber}
                      phase={turnData.phase}
                    />
                  </MatchStrip>
                </div>
              </div>
              <div className="pointer-events-auto flex gap-2">
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
            </div>
            <div className="phone-notice-bar absolute left-1/2 -translate-x-1/2 pointer-events-none z-40">
              <PhoneNotice eventBus={eventBus} />
            </div>
            <div
              className="phone-bottom-bar absolute left-1/2 flex w-max max-w-[96vw] -translate-x-1/2 pointer-events-none z-[55]"
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
          {mode === "sandbox" && sandboxPanel}
          <KickoffEventOverlay eventBus={eventBus} />
        </>
      }
      bottomLeft={
        <>
          <PlayerInfoPanel eventBus={eventBus} />
          <div className="min-h-[160px] w-full flex-[0_1_50vh]">
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
                kickoffTurn={kickoffTurn}
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
