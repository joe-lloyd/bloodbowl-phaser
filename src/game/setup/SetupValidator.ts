import {
  SetupZone,
  ValidationResult,
  FormationPosition,
  SetupConfig,
} from "../types/SetupTypes";

/**
 * SetupValidator - Pure logic for validating setup rules
 * No Phaser dependencies - 100% unit testable
 */
export class SetupValidator {
  private config: SetupConfig;

  constructor(
    config: SetupConfig = { minPlayers: 7, pitchWidth: 20, pitchHeight: 11 }
  ) {
    this.config = config;
  }

  /**
   * Check if a position is within the setup zone for a team
   * Team 1 (left): x: 0-5, y: 0-10
   * Team 2 (right): x: 14-19, y: 0-10
   */
  isInSetupZone(x: number, y: number, isTeam1: boolean): boolean {
    // Check Y bounds (same for both teams)
    if (y < 0 || y >= this.config.pitchHeight) {
      return false;
    }

    // Check X bounds (different for each team)
    if (isTeam1) {
      return x >= 0 && x <= 5;
    } else {
      return x >= 14 && x < this.config.pitchWidth;
    }
  }

  /**
   * Get the setup zone boundaries for a team
   */
  getSetupZone(isTeam1: boolean): SetupZone {
    if (isTeam1) {
      return {
        minX: 0,
        maxX: 5,
        minY: 0,
        maxY: this.config.pitchHeight - 1,
      };
    } else {
      return {
        minX: 14,
        maxX: this.config.pitchWidth - 1,
        minY: 0,
        maxY: this.config.pitchHeight - 1,
      };
    }
  }

  /**
   * Check if setup can be confirmed
   * Rules:
   * - Must have at least 7 players placed, OR
   * - No players left available to place
   */
  canConfirmSetup(placedCount: number, availableCount: number): boolean {
    // Can confirm if we have minimum players
    if (placedCount >= this.config.minPlayers) {
      return true;
    }

    // Can confirm if no players left to place (even if less than minimum)
    if (availableCount === 0) {
      return true;
    }

    return false;
  }

  /**
   * Validate a complete formation
   * Checks that all positions are within setup zone and no duplicates
   */
  validateFormation(
    positions: FormationPosition[],
    isTeam1: boolean
  ): ValidationResult {
    const errors: string[] = [];

    // Check minimum players
    if (positions.length < this.config.minPlayers) {
      errors.push(
        `Formation must have at least ${this.config.minPlayers} players`
      );
    }

    // Check for duplicate positions
    const positionSet = new Set<string>();
    for (const pos of positions) {
      const key = `${pos.x},${pos.y}`;
      if (positionSet.has(key)) {
        errors.push(`Duplicate position at (${pos.x}, ${pos.y})`);
      }
      positionSet.add(key);
    }

    // Check all positions are in setup zone
    for (const pos of positions) {
      if (!this.isInSetupZone(pos.x, pos.y, isTeam1)) {
        errors.push(`Position (${pos.x}, ${pos.y}) is outside setup zone`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if a position is occupied
   */
  isPositionOccupied(
    x: number,
    y: number,
    placedPositions: FormationPosition[]
  ): boolean {
    return placedPositions.some((pos) => pos.x === x && pos.y === y);
  }
}
