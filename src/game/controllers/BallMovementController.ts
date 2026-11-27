import { activeRules } from "../variants/activeMatch";
import type { DiceController } from "./DiceController";
import { isOnPitch } from "../rules/pitchSquares";

type MovementDice = Pick<DiceController, "rollD8" | "rollMultipleD8" | "rollD3" | "rollD6" | "rollLowerOf2D6">;

export class BallMovementController {
  private diceController: MovementDice;
  constructor(diceController: MovementDice) {
    this.diceController = diceController;
  }

  public bounce(position: { x: number; y: number }): { x: number; y: number } {
    return this.calculateScatterStep(position, "Bounce");
  }

  public scatter(
    position: {
      x: number;
      y: number;
    },

    rollType: "Scatter" | "Team-mate Scatter" = "Scatter",
    squares = 3
  ): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let currentPos = { ...position };

    const rolls = this.diceController.rollMultipleD8(rollType, squares);

    for (const direction of rolls) {
      currentPos = this.calculateOffsetPosition(currentPos, direction, 1);
      path.push(currentPos);
      if (!isOnPitch(currentPos)) break;
    }

    return path;
  }

  public deviate(
    position: { x: number; y: number },

    useKickD3 = false,

    teamId?: string
  ): { x: number; y: number } {
    const direction = this.diceController.rollD8(
      "Kickoff Deviate Direction",
      teamId
    );

    const distance = useKickD3
      ? this.diceController.rollD3("Kickoff Deviate Distance (Kick)", teamId)
      : this.kickDistance(teamId);

    return this.calculateOffsetPosition(position, direction, distance);
  }

  private kickDistance(teamId?: string): number {
    return activeRules().kickDeviation === "d6"
      ? this.diceController.rollD6("Kickoff Deviate Distance", teamId)
      : this.diceController.rollLowerOf2D6("Kickoff Deviate Distance", teamId);
  }

  private calculateScatterStep(
    position: { x: number; y: number },
    reason: string
  ): { x: number; y: number } {
    const direction = this.diceController.rollD8(reason);
    return this.calculateOffsetPosition(position, direction, 1);
  }

  private calculateOffsetPosition(
    start: { x: number; y: number },
    direction: number,
    distance: number
  ): { x: number; y: number } {
    let dx = 0;
    let dy = 0;

    switch (direction) {
      case 1:
        dx = -1;
        dy = -1;
        break;
      case 2:
        dx = 0;
        dy = -1;
        break;
      case 3:
        dx = 1;
        dy = -1;
        break;
      case 4:
        dx = -1;
        dy = 0;
        break;
      case 5:
        dx = 1;
        dy = 0;
        break;
      case 6:
        dx = -1;
        dy = 1;
        break;
      case 7:
        dx = 0;
        dy = 1;
        break;
      case 8:
        dx = 1;
        dy = 1;
        break;
    }

    return {
      x: start.x + dx * distance,
      y: start.y + dy * distance,
    };
  }
}
