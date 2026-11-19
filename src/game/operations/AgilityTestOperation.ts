import { GameOperation } from "../core/GameOperation";
import type { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { withRerollOffer } from "../skills";
import { type RerollableRollKind } from "../../types/decisions";
import { requiredRoll } from "../rules/rollTargets";

export class AgilityTestOperation extends GameOperation {
  public readonly name = "AgilityTestOperation";
  public success = false;
  public roll = 0;
  public effectiveTotal = 0;

  private playerId: string;
  private testName: string;
  private targetNumber: number;
  private modifiers: number;
  private description: (string) | undefined;
  private rerollKind: (RerollableRollKind) | undefined;
  constructor(
    playerId: string,
    testName: string,
    targetNumber: number,
    modifiers: number,
    description?: string,

    rerollKind?: RerollableRollKind
  ) {
    super();
    this.playerId = playerId;
    this.testName = testName;
    this.targetNumber = targetNumber;
    this.modifiers = modifiers;
    this.description = description;
    this.rerollKind = rerollKind;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;

    const modString =
      this.modifiers >= 0
        ? `+${String(this.modifiers)}`
        : `${String(this.modifiers)}`;
    const info = this.description || `${this.testName} Test`;
    const needed = requiredRoll(this.targetNumber, this.modifiers);
    eventBus.emit(
      GameEventNames.UI_Notification,
      this.modifiers === 0
        ? `${info}: ${String(needed)}+`
        : `${info}: ${String(needed)}+ (${String(this.targetNumber)}+, ${modString})`
    );

    const doRoll = () =>
      gameService
        .getDiceController()
        .rollSkillCheck(
          { reason: this.testName,target: this.targetNumber,modifier: this.modifiers,playerName: player.playerName,teamId: player.teamId }        );
    const result = this.rerollKind
      ? await withRerollOffer(
          { gameService, eventBus },
          player,
          this.rerollKind,
          doRoll
        )
      : doRoll();

    this.success = result.success;
    this.roll = result.roll;
    this.effectiveTotal = result.effectiveTotal;
  }
}
