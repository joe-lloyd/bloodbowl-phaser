import { registerActionCommands } from "../game/controllers/handlers/actionCommands";
import { actionStepsFor } from "../game/controllers/interaction/actionSteps";
import { FormationManager } from "../game/managers/FormationManager";
import { scopeEventBus } from "../services/scopedEventBus";
import { type ActionStep, GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import type { Team } from "../types/Team";
import type { MatchFixture } from "./fixtures";
import { GALLERY_FORMATIONS } from "./variantHelpers";

type Bus = ReturnType<typeof scopeEventBus>;

function answerActionMenu(bus: Bus): void {
  let steps: ActionStep[] = [];
  const show = (next: ActionStep[], currentStepId: string) => {
    steps = next;
    bus.emit(GameEventNames.UI_UpdateActionSteps, { steps, currentStepId });
  };
  const deselect = () => {
    show([], "");
    bus.emit(GameEventNames.PlayerSelected, { player: null });
  };
  bus.on(GameEventNames.UI_UpdateActionSteps, (data) => {
    steps = data.steps;
  });
  bus.on(GameEventNames.UI_ActionSelected, (data) => {
    if (data.action === "forgoe") {
      deselect();
      return;
    }
    const next = actionStepsFor(data.action, data.blockReplacement ?? null);
    show(next, next[0]?.id ?? "");
  });
  bus.on(GameEventNames.UI_StepSelected, ({ stepId }) => {
    show(steps, stepId);
  });
  bus.on(GameEventNames.UI_CancelAction, () => {
    show([], "");
  });
  bus.on(GameEventNames.UI_EndActivation, deselect);
  const dropPlan = () => {
    bus.emit(GameEventNames.UI_ActionPlan, null);
  };
  bus.on(GameEventNames.UI_GoMovePlan, dropPlan);
  bus.on(GameEventNames.UI_ClearMovePlan, dropPlan);
}

interface SetupDesk {
  bus: Bus;
  fx: MatchFixture;
  active: () => Team;
}

function setupActions({ bus, fx, active }: SetupDesk) {
  const { gameService } = fx.services;
  const manager = new FormationManager();
  const list = () => {
    const isTeam1 = active() === fx.team1;
    bus.emit(GameEventNames.UI_FormationsUpdated, {
      formations: manager.listAllFormations(GALLERY_FORMATIONS, isTeam1),
      isTeam1,
    });
  };
  const actions: Partial<Record<string, (name?: string) => void>> = {
    list,
    confirm: () => {
      gameService.confirmSetup(active().id);
    },
    continue: () => {
      gameService.resolveSetupConcession(active().id, false);
    },
    concede: () => {
      gameService.resolveSetupConcession(active().id, true);
    },
    clear: () => {
      for (const { id } of active().players) {
        gameService.removePlayer(id);
      }
    },
    load: (name = "") => {
      const formation = manager.getFormation(
        GALLERY_FORMATIONS,
        name,
        active() === fx.team1
      );
      if (formation) gameService.applySetupFormation(active().id, formation);
    },
    save: (name = "") => {
      const positions = active().players.flatMap(({ id, gridPosition }) =>
        gridPosition ? { playerId: id, ...gridPosition } : []
      );
      manager.saveFormation(GALLERY_FORMATIONS, positions, name);
      list();
    },
    delete: (name = "") => {
      manager.deleteFormation(GALLERY_FORMATIONS, name);
      list();
    },
  };
  return actions;
}

function answerSetup(bus: Bus, fx: MatchFixture): void {
  const { gameService } = fx.services;
  const active = () =>
    gameService.getState().activeTeamId === fx.team2.id ? fx.team2 : fx.team1;
  const actions = setupActions({ bus, fx, active });
  bus.on(GameEventNames.UI_SetupAction, ({ action, name }) => {
    actions[action]?.(name);
  });
  bus.on(GameEventNames.PhaseChanged, ({ phase, subPhase }) => {
    const status = gameService.getSetupStatus(active().id);
    const placing =
      subPhase === SubPhase.SETUP_KICKING ||
      subPhase === SubPhase.SETUP_RECEIVING;
    if (phase === GamePhase.SETUP && placing && status)
      bus.emit(GameEventNames.UI_ShowSetupControls, {
        subPhase,
        activeTeam: active(),
        status,
      });
    else bus.emit(GameEventNames.UI_HideSetupControls, undefined);
  });
}

function answerMoves(bus: Bus): void {
  bus.on(GameEventNames.PlayerMoved, ({ followUpData, presentationId }) => {
    if (followUpData)
      bus.emit(GameEventNames.UI_FollowUpPrompt, {
        ...followUpData,
        repeat: true,
      });
    if (presentationId)
      bus.emit(GameEventNames.UI_PresentationAcknowledged, {
        id: presentationId,
      });
  });
}

export function standInForScene(fx: MatchFixture): () => void {
  const bus = scopeEventBus(fx.bus);
  const stopCommands = registerActionCommands(fx.services.gameService, bus);
  answerActionMenu(bus);
  answerMoves(bus);
  answerSetup(bus, fx);
  return () => {
    stopCommands();
    bus.dispose();
  };
}
