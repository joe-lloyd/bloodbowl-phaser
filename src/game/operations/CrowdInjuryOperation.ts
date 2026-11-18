/**
 * CrowdInjuryOperation - Injury by the Crowd (rulebook p.68).
 *
 * A player pushed into the crowd takes an immediate injury roll with NO
 * armour roll. A Stunned result places them in the Reserves box instead of
 * on the pitch. If they carried the ball it is thrown in from the square
 * they exited (p.73), and an active-team player surfing causes a turnover
 * (absorbed by the turnover latch if one is already resolving).
 */

import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { GameState } from "../../types/GameState";
import { InjuryResult } from "../controllers/InjuryController";
import { CasualtyOperation } from "./CasualtyOperation";
import { BounceOperation } from "./BounceOperation";
import { reportedInjury, resolveInjuryRoll } from "./InjuryOperation";
import { movePlayerToBox } from "../rules/playerLocation";
import { offerApothecary } from "../inducements/apothecary";

export class CrowdInjuryOperation extends GameOperation {
  public readonly name = "CrowdInjury";

  constructor(
    private playerId: string,
    private exitSquare: { x: number; y: number },
    /**
     * Whether this surf is a turnover, decided when the push happened —
     * by resolution time the activation may already have ended the turn,
     * so the active team can no longer be read from the game state.
     */
    private isTurnover: boolean,
    /**
     * Treacherous Trapdoor (L12): the player fell through the Trapdoor at
     * `exitSquare` instead, so a ball they carried Bounces from it.
     */
    private trapdoor?: { carriedBall: boolean },
    /** A thrown player may exit from a square holding someone else's ball. */
    private carriedBallOverride?: boolean
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;

    // Ball carried off the pitch is thrown back in before injury drama
    const carriedBall = this.carriedBall(gameService.getState());

    eventBus.emit(
      GameEventNames.UI_Notification,
      this.trapdoor
        ? `${player.playerName} falls through a Trapdoor!`
        : `${player.playerName} is pushed into the crowd!`
    );
    await context.delay(800);

    // Injury by the Crowd: straight to the injury roll, no armour roll
    const rollType = `Injury by the Crowd (${player.playerName})`;
    const roll = gameService.getDiceController().roll2D6(rollType);
    const { result } = await resolveInjuryRoll(context, player, roll, 0);
    eventBus.emit(GameEventNames.InjuryRolled, {
      playerId: player.id,
      result: reportedInjury(gameService, player.id, result),
      rollType,
      stunnedToReserves: true,
    });

    // A player in the crowd is off the pitch whatever the result — every
    // branch moves them through the one location seam (the trailing
    // PlayerStatusChanged below stays the single announcement).
    switch (result) {
      case InjuryResult.STUNNED:
        // Stunned by the crowd = dumped in the Reserves box instead
        eventBus.emit(
          GameEventNames.UI_Notification,
          "Thrown back to the reserves!"
        );
        movePlayerToBox(player, { box: "reserves" });
        break;
      case InjuryResult.KO: {
        eventBus.emit(GameEventNames.UI_Notification, "KNOCKED OUT!");
        // A crowd KO's Apothecary patch-up moves the player to Reserves
        // rather than back onto the pitch — there is no square to return to.
        const patchedUp = await offerApothecary(gameService, eventBus, player, {
          resultKind: "ko",
          location: "crowd",
        });
        if (!patchedUp) {
          movePlayerToBox(player, { box: "ko" });
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
        flowManager.add(new CasualtyOperation(this.playerId, result), true);
        break;
    }
    eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    await context.delay(600);

    this.afterCrowd(context, carriedBall);
  }

  private carriedBall(state: GameState): boolean {
    if (this.carriedBallOverride !== undefined) return this.carriedBallOverride;
    if (this.trapdoor) return this.trapdoor.carriedBall;
    return ballOnSquare(state, this.exitSquare);
  }

  /** Return a carried ball to play, then end the turn if it was one's own. */
  private afterCrowd(context: FlowContext, carriedBall: boolean): void {
    const { gameService, flowManager } = context;
    if (carriedBall && this.trapdoor) {
      gameService.setBallPosition(this.exitSquare.x, this.exitSquare.y);
      flowManager.add(new BounceOperation(this.exitSquare), true);
    } else if (carriedBall) {
      gameService.throwInBall(this.exitSquare);
    }

    // Active-team player surfed = turnover (latch absorbs duplicates)
    if (this.isTurnover) {
      gameService.triggerTurnover(
        this.trapdoor ? "Fell through a Trapdoor" : "Pushed into the Crowd"
      );
    }
  }
}
