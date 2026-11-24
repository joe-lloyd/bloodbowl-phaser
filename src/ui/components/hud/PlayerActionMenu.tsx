import type { ActionAvailability } from "../../../game/rules/actionAvailability";
import { useActionSelection } from "./useActionSelection";
import type React from "react";
import type { EventBus } from "../../../services/EventBus";
import { useHeldOnline } from "../../hooks/useHeldOnline";
import { PlayerStatus, type Player } from "../../../types/Player";
import { GamePhase } from "../../../types/GameState";
import { GameEventNames, type ActionType } from "../../../types/events";
import type { BlockReplacement } from "../../../types/BlockReplacement";
import { Panel } from "../componentWarehouse/HudKit";
import { ActionStepper } from "./ActionStepper";
import { MenuHeader, ActionList } from "./actionMenuButtons";
import {
  menuActionRequest,
  actingSide,
  razzleDazzle,
  readMenuAvailability,
  type MenuTurnData,
} from "./useActionMenu";

interface PlayerActionMenuProps {
  eventBus: EventBus;

  turnData: MenuTurnData;

  compact?: boolean;
}

export function PlayerActionMenu(props: PlayerActionMenuProps) {
  const { eventBus, turnData, compact = false } = props;
  const {
    selectedPlayer,
    actionSteps,
    currentStepId,
    hasMovedInAction,
    razzleOn,
    setRazzleOn,
  } = useActionSelection(eventBus, turnData);
  const held = useHeldOnline();
  const { activeCharge, effectiveActiveTeamId } = actingSide(turnData);
  const { declaration, secondActionAfter, canRazzle } = razzleDazzle(
    selectedPlayer,
    !!activeCharge
  );

  const availability = readMenuAvailability({
    selectedPlayer,
    effectiveActiveTeamId,
    turnData,
    activeCharge,
    hasMovedInAction,
    secondActionAfter,
  });

  if (!selectedPlayer || held) return null;

  if (turnData.phase === GamePhase.KICKOFF && !activeCharge) return null;

  if (selectedPlayer.teamId !== effectiveActiveTeamId) return null;

  const handleAction = (
    action: ActionType,
    blockReplacement?: BlockReplacement
  ) => {
    eventBus.emit(
      GameEventNames.UI_ActionSelected,
      menuActionRequest(selectedPlayer.id, action, {
        blockReplacement,
        razzleOn,
        canRazzle,
      })
    );
  };

  return (
    <PlayerActionMenuView
      compact={compact}
      selectedPlayer={selectedPlayer}
      secondActionAfter={secondActionAfter}
      actionSteps={actionSteps}
      currentStepId={currentStepId}
      eventBus={eventBus}
      hasMovedInAction={hasMovedInAction}
      declaration={declaration}
      handleAction={handleAction}
      availability={availability}
      canRazzle={canRazzle}
      razzleOn={razzleOn}
      setRazzleOn={setRazzleOn}
    />
  );
}

interface PlayerActionMenuViewProps {
  compact: boolean;
  selectedPlayer: Player;
  secondActionAfter: ActionType | undefined;
  actionSteps: { id: string; label: string }[];
  currentStepId: string | null;
  eventBus: EventBus;
  hasMovedInAction: boolean;
  declaration: {
    id: string;
    action: ActionType | null;
    blockReplacement?: BlockReplacement;
    blockReplacementUsed?: boolean;
    committed?: boolean;
    bloodlustUnsated?: boolean;
    grudgeMatch?: boolean;
    razzleDazzle?: {
      actions: ActionType[];
      awaitingSecond?: boolean;
      movementBefore?: number;
    };
    stalling?: boolean;
  } | null;
  handleAction: (
    action: ActionType,
    blockReplacement?: BlockReplacement
  ) => void;
  availability: ActionAvailability;
  canRazzle: boolean;
  razzleOn: boolean;
  setRazzleOn: React.Dispatch<React.SetStateAction<boolean>>;
}

function stopMenuPointer(event: React.SyntheticEvent): void {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}
function PlayerActionMenuView({
  compact,
  selectedPlayer,
  secondActionAfter,
  actionSteps,
  currentStepId,
  eventBus,
  hasMovedInAction,
  declaration,
  handleAction,
  availability,
  canRazzle,
  razzleOn,
  setRazzleOn,
}: PlayerActionMenuViewProps) {
  return (
    <MenuPanelShell>
      <Panel
        accent="gold"
        className={
          compact
            ? "flex min-h-0 flex-col !border-0 !bg-transparent !shadow-none"
            : "flex min-h-0 flex-col"
        }
      >
        {!compact && (
          <MenuHeader
            player={selectedPlayer}
            secondAction={!!secondActionAfter}
          />
        )}

        {actionSteps.length > 0 ? (
          <ActionStepper
            steps={actionSteps}
            currentStepId={currentStepId ?? ""}
            eventBus={eventBus}
            hasMovedInAction={hasMovedInAction}
            compact={compact}
            firstOfTwo={declaration?.razzleDazzle?.actions.length === 1}
          />
        ) : (
          <ActionList
            onAction={handleAction}
            availability={availability}
            isProne={selectedPlayer.status === PlayerStatus.PRONE}
            hasActed={selectedPlayer.hasActed}
            compact={compact}
            canRazzle={canRazzle}
            razzleOn={razzleOn}
            onToggleRazzle={() => {
              setRazzleOn((on) => !on);
            }}
            secondActionAfter={secondActionAfter}
          />
        )}
      </Panel>
    </MenuPanelShell>
  );
}

function MenuPanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="player-action-menu"
      className="w-full max-h-[60vh] phone:max-h-none min-h-0 shrink flex flex-col pointer-events-auto animate-hud-in z-50"
      style={{ pointerEvents: "auto", zIndex: 9999 }}
      onClick={stopMenuPointer}
      onPointerDown={stopMenuPointer}
      onMouseDown={stopMenuPointer}
    >
      {children}
    </div>
  );
}
