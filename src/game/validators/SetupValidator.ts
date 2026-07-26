import {
  getLineOfScrimmageX,
  getSevensSetupZone,
  getWideZone,
  isCentreFieldRow,
  isNeutralZoneX,
} from "../../config/GameConfig";
import {
  SetupZone,
  ValidationResult,
  FormationPosition,
  SetupConfig,
  SetupRestriction,
} from "@/types/SetupTypes";

/**
 * Authoritative, dependency-free Blood Bowl Sevens setup rules.
 *
 * Browser placement, formations, online commands and the headless protocol all
 * call this class. A restriction is retained even when it is relaxed so the UI
 * can explain why confirmation is permitted for a short-handed team.
 */
export class SetupValidator {
  private config: Required<SetupConfig>;

  constructor(
    config: SetupConfig = {
      minPlayers: 7,
      maxPlayers: 7,
      pitchWidth: 20,
      pitchHeight: 11,
    }
  ) {
    this.config = {
      ...config,
      maxPlayers: config.maxPlayers ?? config.minPlayers,
    };
  }

  isInSetupZone(x: number, y: number, isTeam1: boolean): boolean {
    if (
      x < 0 ||
      x >= this.config.pitchWidth ||
      y < 0 ||
      y >= this.config.pitchHeight
    ) {
      return false;
    }
    const zone = getSevensSetupZone(isTeam1);
    return x >= zone.minX && x <= zone.maxX;
  }

  getSetupZone(isTeam1: boolean): SetupZone {
    const zone = getSevensSetupZone(isTeam1);
    return {
      ...zone,
      minY: 0,
      maxY: this.config.pitchHeight - 1,
    };
  }

  isOnCentreLineOfScrimmage(x: number, y: number, isTeam1: boolean): boolean {
    return x === getLineOfScrimmageX(isTeam1) && isCentreFieldRow(y);
  }

  /**
   * Validate a candidate placement without requiring the still-incomplete
   * formation to satisfy confirmation-only restrictions.
   */
  validatePlacement(
    candidate: FormationPosition,
    currentPositions: FormationPosition[],
    isTeam1: boolean,
    availablePlayerCount: number
  ): ValidationResult {
    const positions = [...currentPositions, candidate];
    const full = this.validateFormation(
      positions,
      isTeam1,
      availablePlayerCount
    );
    const placementIds = new Set([
      "neutral-zone",
      "setup-area",
      "duplicate-square",
      "max-seven",
      "wide-zone-limit",
    ]);
    const restrictions = full.restrictions.filter((rule) =>
      placementIds.has(rule.id)
    );
    if (availablePlayerCount < 3) {
      restrictions.push({
        id: "short-handed-line",
        satisfied: this.isOnCentreLineOfScrimmage(
          candidate.x,
          candidate.y,
          isTeam1
        ),
        satisfiable: true,
        message:
          "A team with fewer than three available players must place every player in Centre Field on its Line of Scrimmage.",
      });
    }
    const errors = restrictions
      .filter((rule) => rule.satisfiable && !rule.satisfied)
      .map((rule) => rule.message);
    return { valid: errors.length === 0, errors, restrictions };
  }

  /**
   * Check confirmation using the same structured result shown in the UI.
   */
  canConfirmSetup(
    positions: FormationPosition[],
    isTeam1: boolean,
    availablePlayerCount: number
  ): boolean {
    return this.validateFormation(positions, isTeam1, availablePlayerCount)
      .valid;
  }

  validateFormation(
    positions: FormationPosition[],
    isTeam1: boolean,
    availablePlayerCount: number = this.config.maxPlayers
  ): ValidationResult {
    const requiredPlayerCount = Math.min(
      this.config.maxPlayers,
      Math.max(0, availablePlayerCount)
    );
    const positionKeys = positions.map((pos) => `${pos.x},${pos.y}`);
    const uniquePositionCount = new Set(positionKeys).size;
    const wideCounts = { top: 0, bottom: 0 };
    positions.forEach((pos) => {
      const zone = getWideZone(pos.y);
      if (zone) wideCounts[zone]++;
    });
    const onCentreLos = positions.filter((pos) =>
      this.isOnCentreLineOfScrimmage(pos.x, pos.y, isTeam1)
    ).length;
    const inNeutralZone = positions.some((pos) => isNeutralZoneX(pos.x));
    const inSetupArea = positions.every((pos) =>
      this.isInSetupZone(pos.x, pos.y, isTeam1)
    );
    const shortHanded = requiredPlayerCount < 3;

    const restrictions: SetupRestriction[] = [
      {
        id: "neutral-zone",
        satisfied: !inNeutralZone,
        satisfiable: true,
        message: "Neither team may set up between the Lines of Scrimmage.",
      },
      {
        id: "setup-area",
        satisfied: inSetupArea,
        satisfiable: true,
        message:
          "Players must stay between their own End Zone and Line of Scrimmage.",
      },
      {
        id: "duplicate-square",
        satisfied: uniquePositionCount === positions.length,
        satisfiable: true,
        message: "Only one player may occupy a pitch square.",
      },
      {
        id: "max-seven",
        satisfied: positions.length <= this.config.maxPlayers,
        satisfiable: true,
        message: `A maximum of ${this.config.maxPlayers} players may be set up.`,
      },
      {
        id: "wide-zone-limit",
        satisfied: wideCounts.top <= 1 && wideCounts.bottom <= 1,
        satisfiable: true,
        message: "Only one player may be set up in each Wide Zone.",
      },
      {
        id: "line-of-scrimmage",
        satisfied: onCentreLos >= 3,
        satisfiable: availablePlayerCount >= 3,
        message:
          "At least three players must stand in Centre Field directly adjacent to the Line of Scrimmage.",
      },
      {
        id: "short-handed-line",
        satisfied:
          !shortHanded ||
          (positions.length === onCentreLos &&
            onCentreLos === requiredPlayerCount),
        satisfiable: shortHanded,
        message:
          "A team with fewer than three available players must place every player in Centre Field on its Line of Scrimmage.",
      },
      {
        id: "required-player-count",
        satisfied: positions.length === requiredPlayerCount,
        satisfiable: true,
        message:
          requiredPlayerCount === this.config.maxPlayers
            ? `Set up exactly ${this.config.maxPlayers} players; extras remain in Reserves.`
            : `Set up all ${requiredPlayerCount} available players.`,
      },
    ];

    const errors = restrictions
      .filter((rule) => rule.satisfiable && !rule.satisfied)
      .map((rule) => rule.message);

    return {
      valid: errors.length === 0,
      errors,
      restrictions,
    };
  }

  isPositionOccupied(
    x: number,
    y: number,
    placedPositions: FormationPosition[]
  ): boolean {
    return placedPositions.some((pos) => pos.x === x && pos.y === y);
  }
}
