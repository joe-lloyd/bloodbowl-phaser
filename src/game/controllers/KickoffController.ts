import type { BallMovementController } from "./BallMovementController";
import type { DiceController } from "./DiceController";
import type { KickoffEvent } from "../kickoff/kickoffEvents";
import { kickoffEventForRoll } from "../kickoff/kickoffTables";
import {
  type WallHit,
  lastSquareOnLine,
  settleKick,
} from "../rules/ballFlight";

type KickDice = Pick<DiceController, "roll2D6" | "rollD6" | "rollD8">;

export class KickoffController {
  private movementController: Pick<BallMovementController, "deviate">;
  private diceController: KickDice;

  constructor({ movementController, diceController }: {
    movementController: Pick<BallMovementController, "deviate">;
    diceController: KickDice;
  }) {
    this.movementController = movementController;
    this.diceController = diceController;
  }

  public rollKickoffEvent(): { roll: number; event: KickoffEvent } {
    const roll = this.diceController.roll2D6("Kickoff Event");
    return { roll, event: kickoffEventForRoll(roll) };
  }

  public calculateKickDestination(
{ targetX,targetY,isTeam1Kicking,useKickD3=false,kickingTeamId }: { targetX: number; targetY: number; isTeam1Kicking: boolean; useKickD3?: boolean; kickingTeamId?: string; }  ): {
    finalX: number;
    finalY: number;
    isTouchback: boolean;
    wallHits: WallHit[];
  } {
    const target = { x: targetX, y: targetY };
    const finalPosition = this.movementController.deviate(
      target,
      useKickD3,
      kickingTeamId
    );

    const kick = settleKick(
      this.diceController,
      { lastIn: lastSquareOnLine(target, finalPosition), to: finalPosition },
      isTeam1Kicking
    );
    const settled = kick.landing ?? finalPosition;

    return {
      finalX: settled.x,
      finalY: settled.y,
      isTouchback: kick.landing === null,
      wallHits: kick.wallHits,
    };
  }
}
