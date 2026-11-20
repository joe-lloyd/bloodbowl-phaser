import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { type GameState } from "../../types/GameState";
import { InjuryResult } from "../controllers/InjuryController";
import { CasualtyOperation } from "./CasualtyOperation";
import { BounceOperation } from "./BounceOperation";
import {
  type ResolvedInjury,
  reportedInjury,
  resolveInjuryRoll,
} from "./InjuryOperation";
import { type Player } from "../../types/Player";
import { movePlayerToBox } from "../rules/playerLocation";
import { offerApothecary } from "../inducements/apothecary";
import { casualtyOutcome, recordSeriousKnockout } from "./injuryVerdict";

export class CrowdInjuryOperation extends GameOperation {
  public readonly name = "CrowdInjury";

  private playerId: string;
  private exitSquare: { x: number; y: number };
  private isTurnover: boolean;
  private trapdoor: ({ carriedBall: boolean }) | undefined;
  private carriedBallOverride: (boolean) | undefined;
  constructor(
    playerId: string,
    exitSquare: { x: number; y: number },

    isTurnover: boolean,

    trapdoor?: { carriedBall: boolean },

    carriedBallOverride?: boolean
  ) {
    super();
    this.playerId = playerId;
    this.exitSquare = exitSquare;
    this.isTurnover = isTurnover;
    this.trapdoor = trapdoor;
    this.carriedBallOverride = carriedBallOverride;
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus } = context;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;

    const carriedBall = this.carriedBall(gameService.getState());

    eventBus.emit(
      GameEventNames.UI_Notification,
      this.trapdoor
        ? `${player.playerName} falls through a Trapdoor!`
        : `${player.playerName} is pushed into the crowd!`
    );
    await context.delay(800);

    const rollType = `Injury by the Crowd (${player.playerName})`;
    const roll = gameService.getDiceController().roll2D6(rollType);
    const injury = await resolveInjuryRoll(context, player, roll, 0);
    eventBus.emit(GameEventNames.InjuryRolled, {
      playerId: player.id,
      result: reportedInjury(gameService, player.id, injury.result),
      rollType,
      stunnedToReserves: true,
    });
    await this.settle(context, player, injury);
    eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    await context.delay(600);

    this.afterCrowd(context, carriedBall);
  }

  private async settle(
    context: FlowContext,
    player: Player,
    { result, casualty, seriousKnockout }: ResolvedInjury
  ): Promise<void> {
    const { gameService, eventBus, flowManager } = context;
    switch (result) {
      case InjuryResult.STUNNED:
        eventBus.emit(
          GameEventNames.UI_Notification,
          "Thrown back to the reserves!"
        );
        movePlayerToBox(player, { box: "reserves" });
        break;
      case InjuryResult.KO: {
        eventBus.emit(GameEventNames.UI_Notification, "KNOCKED OUT!");

        const patchedUp = await offerApothecary(gameService, eventBus, player, {
          resultKind: "ko",
          location: "crowd",
        });
        if (patchedUp) break;
        movePlayerToBox(player, { box: "ko" });
        if (seriousKnockout) {
          recordSeriousKnockout(context, player, { cause: "crowd" });
        }
        break;
      }
      case InjuryResult.BADLY_HURT:
      case InjuryResult.SERIOUSLY_HURT:
      case InjuryResult.DEAD:
        eventBus.emit(GameEventNames.UI_Notification, "CASUALTY!");
        movePlayerToBox(player, { box: "casualty" });
        eventBus.emit(GameEventNames.PlayerCasualtyInflicted, {
          victimId: player.id,
          cause: "crowd",
          sppEligible: false,
        });
        flowManager.add(
          new CasualtyOperation(this.playerId, casualtyOutcome(result, casualty)),
          true
        );
        break;
    }
  }

  private carriedBall(state: GameState): boolean {
    if (this.carriedBallOverride !== undefined) return this.carriedBallOverride;
    if (this.trapdoor) return this.trapdoor.carriedBall;
    return ballOnSquare(state, this.exitSquare);
  }

  private afterCrowd(context: FlowContext, carriedBall: boolean): void {
    const { gameService, flowManager } = context;
    if (carriedBall && this.trapdoor) {
      gameService.setBallPosition(this.exitSquare.x, this.exitSquare.y);
      flowManager.add(new BounceOperation(this.exitSquare), true);
    } else if (carriedBall) {
      gameService.throwInBall(this.exitSquare);
    }

    if (this.isTurnover) {
      gameService.triggerTurnover(
        this.trapdoor ? "Fell through a Trapdoor" : "Pushed into the Crowd"
      );
    }
  }
}
