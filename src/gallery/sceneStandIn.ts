import { actionStepsFor } from "../game/controllers/interaction/actionSteps";
import { FormationManager } from "../game/managers/FormationManager";
import { SetupValidator } from "../game/validators/SetupValidator";
import { scopeEventBus } from "../services/scopedEventBus";
import {
  type ActionStep,
  type AllEvents,
  GameEventNames,
} from "../types/events";
import type { FormationPosition, SetupTeamStatus } from "../types/SetupTypes";
import type { MatchFixture } from "./fixtures";
import { BLOCK_FACES, rollBlock } from "./variantHelpers";

type Bus = ReturnType<typeof scopeEventBus>;
type SetupAction = AllEvents[typeof GameEventNames.UI_SetupAction];

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

const FACES = Object.values(BLOCK_FACES);

function answerBlocks(bus: Bus, fx: MatchFixture): void {
  let dice = 2;
  bus.on(GameEventNames.BlockDiceRolled, ({ numDice }) => {
    dice = numDice;
  });
  const roll = () => {
    rollBlock(fx, { results: FACES.slice(2, 2 + dice) });
  };
  bus.on(GameEventNames.UI_RollBlockDice, ({ numDice }) => {
    dice = numDice;
    setTimeout(roll, 300);
  });
  bus.on(GameEventNames.UI_TeamRerollBlock, roll);
  bus.on(GameEventNames.UI_ProRerollBlockDie, roll);
  bus.on(GameEventNames.UI_BrawlerRerollBlockDie, roll);
  bus.on(GameEventNames.UI_BlockResultSelected, ({ result }) => {
    bus.emit(GameEventNames.DecisionResolved, {
      type: "block-dice",
      result: result.type,
    });
  });
}

function placed(
  status: SetupTeamStatus,
  isTeam1: boolean,
  positions: FormationPosition[]
): SetupTeamStatus {
  const { restrictions } = new SetupValidator().validateFormation({
    positions,
    isTeam1,
    availablePlayerCount: status.availablePlayerCount,
  });
  return {
    ...status,
    placedPlayerCount: positions.length,
    restrictions,
    canConfirm: positions.length >= status.requiredPlayerCount,
  };
}

function answerSetup(bus: Bus, fx: MatchFixture): void {
  const manager = new FormationManager();
  let status: SetupTeamStatus | null = null;
  const isTeam1 = () => status?.teamId !== fx.team2.id;
  const key = "gallery";
  const listFormations = () => {
    bus.emit(GameEventNames.UI_FormationsUpdated, {
      formations: manager.listAllFormations(key, isTeam1()),
      isTeam1: isTeam1(),
    });
  };
  const place = (positions: FormationPosition[]) => {
    if (status)
      bus.emit(
        GameEventNames.SetupRestrictionsUpdated,
        placed(status, isTeam1(), positions)
      );
  };
  const formation = (name = "") =>
    manager.getFormation(key, name, isTeam1()) ?? [];
  const hide = () => {
    bus.emit(GameEventNames.UI_HideSetupControls, undefined);
  };
  const actions: Partial<Record<string, (name?: string) => void>> = {
    confirm: hide,
    concede: hide,
    clear: () => {
      place([]);
    },
    load: (name) => {
      place(formation(name));
    },
    continue: () => {
      if (status)
        bus.emit(GameEventNames.SetupRestrictionsUpdated, {
          ...status,
          concessionDecision: "continue",
        });
    },
    save: (name = "") => {
      manager.saveFormation(key, formation("Balanced"), name);
      listFormations();
    },
    delete: (name = "") => {
      manager.deleteFormation(key, name);
      listFormations();
    },
  };
  bus.on(GameEventNames.UI_ShowSetupControls, (shown) => {
    status = shown.status ?? null;
  });
  bus.on(GameEventNames.SetupRestrictionsUpdated, (next) => {
    status = next;
  });
  bus.on(GameEventNames.UI_SetupAction, ({ action, name }: SetupAction) => {
    actions[action]?.(name);
  });
}

function answerDecisions(bus: Bus, fx: MatchFixture): void {
  const { gameService } = fx.services;
  bus.on(GameEventNames.UI_RerollResponse, ({ accept, source }) => {
    gameService.answerReroll(accept, source);
  });
  bus.on(GameEventNames.UI_ReactionResponse, ({ accept }) => {
    gameService.answerReaction(accept);
  });
  bus.on(GameEventNames.UI_InterceptionResponse, ({ playerId }) => {
    gameService.answerInterception(playerId);
  });
  bus.on(GameEventNames.UI_ApothecaryResponse, ({ accept }) => {
    gameService.answerApothecary(accept);
  });
}

export function standInForScene(fx: MatchFixture): () => void {
  const bus = scopeEventBus(fx.bus);
  answerActionMenu(bus);
  answerBlocks(bus, fx);
  answerSetup(bus, fx);
  answerDecisions(bus, fx);
  return () => {
    bus.dispose();
  };
}
