import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { FlowContext } from "../core/GameFlowManager";
import { Player } from "../../types/Player";
import { TeamSpecialRule } from "../../types/Team";
import { hasTeamSpecialRule } from "../rules/teamAllegiance";

/**
 * ArgueTheCallOperation
 *
 * Responsibility:
 * - Perform the D6 roll for "Argue the Call" (Sevens rule M6): on a 5 or 6
 *   the referee is swayed. The coach is never ejected.
 * - Bribery and Corruption (2025 rulebook p.154): once per game, a roll of
 *   1 is re-rolled. A 1 always fails, so the re-roll is always taken.
 * - Expose the result as `swayed` for the operation that runs it.
 */
export class ArgueTheCallOperation extends GameOperation {
  public readonly name = "ArgueTheCallOperation";
  public swayed = false;

  constructor(private player: Player) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const foulController = gameService.getFoulController();
    const diceController = gameService.getDiceController();
    const teamId = this.player.teamId;

    eventBus.emit(
      GameEventNames.UI_Notification,
      "Coach is Arguing the Call..."
    );

    let roll = diceController.rollD6("Argue the Call", teamId);
    const state = gameService.getState();
    const team = gameService.getTeam(teamId);
    if (
      roll === 1 &&
      team &&
      hasTeamSpecialRule(team, TeamSpecialRule.BRIBERY_AND_CORRUPTION) &&
      !state.briberyRerollsUsed?.includes(teamId)
    ) {
      state.briberyRerollsUsed = [...(state.briberyRerollsUsed ?? []), teamId];
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: this.player.id,
        skill: TeamSpecialRule.BRIBERY_AND_CORRUPTION,
        effect: "Bribery and Corruption: re-roll the Argue the Call 1",
      });
      roll = diceController.rollD6("Argue the Call (re-roll)", teamId);
    }
    this.swayed = foulController.resolveArgueTheCall(roll) === "swayed";
    eventBus.emit(
      GameEventNames.UI_Notification,
      this.swayed
        ? "Referee is swayed! Player returns to their square."
        : "Referee ignores the argument."
    );

    await context.delay(800);
  }
}
