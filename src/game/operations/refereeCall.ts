import { GameEventNames, RefereeCallStep } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { FlowContext } from "../core/GameFlowManager";
import { Player } from "../../types/Player";
import { TeamSpecialRule } from "../../types/Team";
import { hasTeamSpecialRule } from "../rules/teamAllegiance";
import { movePlayerToBox } from "../rules/playerLocation";
import { offerBribe } from "../inducements/bribes";
import {
  awaitPresentation,
  nextPresentationId,
} from "../presentation/presentationGate";

/** The longest the engine waits for the card to show the outcome. */
const OUTCOME_PRESENTATION_TIMEOUT_MS = 8000;

export type SendOffResult = "swayed" | "bribed" | "sent-off";

/**
 * The referee Sends-off a player, and the coach does what they can about
 * it, in the rulebook's order:
 * - Argue the Call (Sevens rule M6): on a 5 or 6 the referee is swayed.
 *   The coach is never ejected, so the argument is always made.
 * - Bribery and Corruption (2025 rulebook p.154): once per game, a roll of
 *   1 is re-rolled. A 1 always fails, so the re-roll is always taken.
 * - A Bribe (p.148) if the argument failed: on a 2+ the player stays.
 * - Otherwise the player goes to the Sent-off box.
 *
 * Each step is a RefereeCall event for the card both coaches watch, and
 * the engine waits for the card to show the outcome. Whether a Turnover
 * follows is the caller's call: a swayed referee still means one, a Bribe
 * that works does not.
 */
export async function resolveSendOff(
  context: FlowContext,
  player: Player,
  cause: RefereeCallStep["cause"]
): Promise<SendOffResult> {
  const gameService = context.gameService as IGameService;
  const { eventBus } = context;
  const call = { playerId: player.id, teamId: player.teamId, cause };
  eventBus.emit(GameEventNames.RefereeCall, { ...call, step: "called" });

  const rolls = argueTheCall(context, player);
  const swayed =
    gameService
      .getFoulController()
      .resolveArgueTheCall(rolls[rolls.length - 1]) === "swayed";
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
  // Through the single location seam, so the pitch square is released as
  // the sent-off dugout entry is created and PlayerStatusChanged fires
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

/** The Argue the Call dice: one, or a 1 and its Bribery and Corruption re-roll. */
function argueTheCall(context: FlowContext, player: Player): number[] {
  const gameService = context.gameService as IGameService;
  const diceController = gameService.getDiceController();
  const teamId = player.teamId;

  context.eventBus.emit(
    GameEventNames.UI_Notification,
    "Coach is Arguing the Call..."
  );
  const rolls = [diceController.rollD6("Argue the Call", teamId)];
  const state = gameService.getState();
  const team = gameService.getTeam(teamId);
  if (
    rolls[0] === 1 &&
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
    rolls.push(diceController.rollD6("Argue the Call (re-roll)", teamId));
  }
  return rolls;
}
