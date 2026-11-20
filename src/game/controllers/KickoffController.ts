import type { BallMovementController } from "./BallMovementController";
import type { DiceController } from "./DiceController";
import { GameConfig, isKickingTeamTerritory } from "@/config/GameConfig";
import type { KickoffEvent } from "../kickoff/kickoffEvents";
import { kickoffEventForRoll } from "../kickoff/kickoffTables";

export class KickoffController {
  private movementController: Pick<BallMovementController, "deviate">;
  private diceController: Pick<DiceController, "roll2D6">;

  constructor({ movementController, diceController }: {
    movementController: Pick<BallMovementController, "deviate">;
    diceController: Pick<DiceController, "roll2D6">;
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
  } {
    const finalPosition = this.movementController.deviate(
      {
        x: targetX,
        y: targetY,
      },
      useKickD3,
      kickingTeamId
    );

    const isOffPitch =
      finalPosition.x < 0 ||
      finalPosition.x >= GameConfig.PITCH_WIDTH ||
      finalPosition.y < 0 ||
      finalPosition.y >= GameConfig.PITCH_HEIGHT;

    const isTouchback =
      isOffPitch || isKickingTeamTerritory(finalPosition.x, isTeam1Kicking);

    return {
      finalX: finalPosition.x,
      finalY: finalPosition.y,
      isTouchback,
    };
  }
}
