import { GameEventNames, type RefereeCallStep } from "../../types/events";
import { type FlowContext } from "../core/GameFlowManager";
import { type Player } from "../../types/Player";
import { TeamSpecialRule } from "../../types/Team";
import { hasTeamSpecialRule } from "../rules/teamAllegiance";
import { movePlayerToBox } from "../rules/playerLocation";
import { offerBribe } from "../inducements/bribes";
import {
  awaitPresentation,
  nextPresentationId,
} from "../presentation/presentationGate";

const OUTCOME_PRESENTATION_TIMEOUT_MS = 8000;

export type SendOffResult = "swayed" | "bribed" | "sent-off";

export async function resolveSendOff(
  context: FlowContext,
  player: Player,
  cause: RefereeCallStep["cause"]
): Promise<SendOffResult> {
  const gameService = context.gameService;
  const { eventBus } = context;
  const call = { playerId: player.id, teamId: player.teamId, cause };
  eventBus.emit(GameEventNames.RefereeCall, { ...call, step: "called" });

  const { rolls, finalRoll } = argueTheCall(context, player);
  const swayed =
    gameService.getFoulController().resolveArgueTheCall(finalRoll) ===
    "swayed";
  eventBus.emit(GameEventNames.RefereeCall, {
    ...call,
    step: "argued",
    rolls,
    swayed,
  });
  eventBus.emit(
    GameEventNames.UI_Notification,
    swayed
      ? "Referee is swayed! Player returns to their square."
      : "Referee ignores the argument."
  );

  let result: SendOffResult = "swayed";
  if (!swayed) {
    const bribe = await offerBribe(gameService, eventBus, player);
    if (bribe)
      eventBus.emit(GameEventNames.RefereeCall, {
        ...call,
        step: "bribed",
        ...bribe,
      });
    result = bribe?.works ? "bribed" : "sent-off";
  }

  if (result === "sent-off") {
    movePlayerToBox(player, { box: "sent-off" }, eventBus);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName} is removed from the pitch.`
    );
  }

  const presentationId = nextPresentationId("referee-call");
  const shown = awaitPresentation(
    eventBus,
    context.delay,
    presentationId,
    OUTCOME_PRESENTATION_TIMEOUT_MS
  );
  eventBus.emit(GameEventNames.RefereeCall, {
    ...call,
    step: "outcome",
    result,
    presentationId,
  });
  await shown;
  return result;
}

function argueTheCall(
  context: FlowContext,
  player: Player
): { rolls: number[]; finalRoll: number } {
  const gameService = context.gameService;
  const diceController = gameService.getDiceController();
  const teamId = player.teamId;

  context.eventBus.emit(
    GameEventNames.UI_Notification,
    "Coach is Arguing the Call..."
  );
  const firstRoll = diceController.rollD6("Argue the Call", teamId);
  const state = gameService.getState();
  const team = gameService.getTeam(teamId);
  if (
    firstRoll === 1 &&
    team &&
    hasTeamSpecialRule(team, TeamSpecialRule.BRIBERY_AND_CORRUPTION) &&
    !state.briberyRerollsUsed?.includes(teamId)
  ) {
    state.briberyRerollsUsed = [...(state.briberyRerollsUsed ?? []), teamId];
    context.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill: TeamSpecialRule.BRIBERY_AND_CORRUPTION,
      effect: "Bribery and Corruption: re-roll the Argue the Call 1",
    });
    const reroll = diceController.rollD6("Argue the Call (re-roll)", teamId);
    context.eventBus.emit(GameEventNames.RerollUsed, {
      playerId: player.id,
      source: "skill",
      skill: TeamSpecialRule.BRIBERY_AND_CORRUPTION,
      rollKind: "argue-the-call",
      before: firstRoll,
      after: reroll,
    });
    return { rolls: [firstRoll, reroll], finalRoll: reroll };
  }
  return { rolls: [firstRoll], finalRoll: firstRoll };
}
