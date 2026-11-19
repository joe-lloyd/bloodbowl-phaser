import { activeLayout, activeRules } from "../variants/activeMatch";
import { obstacleAt } from "../variants/pitchLayouts";
import {
  getLineOfScrimmageX,
  getSevensSetupZone,
  getWideZone,
  isCentreFieldRow,
  isNeutralZoneX,
} from "../../config/GameConfig";
import {
  type SetupZone,
  type ValidationResult,
  type FormationPosition,
  type SetupConfig,
  type SetupPlayerLimits,
} from "@/types/SetupTypes";

import {
  setupRestrictions,
  setupValidation,
  SHORT_HANDED_MESSAGE,
} from "./setupRestrictions";

interface FormationInput {
  positions: FormationPosition[];
  isTeam1: boolean;
  availablePlayerCount?: number | undefined;
  limits?: SetupPlayerLimits | undefined;
}

export class SetupValidator {
  private config: Required<SetupConfig>;

  constructor(config?: SetupConfig) {
    const layout = activeLayout();
    const { maxOnPitch } = activeRules().setup;
    const resolved = config ?? {
      minPlayers: maxOnPitch,
      maxPlayers: maxOnPitch,
      pitchWidth: layout.cols,
      pitchHeight: layout.rows,
    };
    this.config = {
      ...resolved,
      maxPlayers: resolved.maxPlayers ?? resolved.minPlayers,
    };
  }

  isInSetupZone(x: number, y: number, isTeam1: boolean): boolean {
    if (
      x < 0 ||
      x >= this.config.pitchWidth ||
      y < 0 ||
      y >= this.config.pitchHeight ||
      obstacleAt(activeLayout(), { x, y })
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

  validatePlacement({
    candidate,
    currentPositions,
    isTeam1,
    availablePlayerCount,
    limits,
  }: {
    candidate: FormationPosition;
    currentPositions: FormationPosition[];
    isTeam1: boolean;
    availablePlayerCount: number;
    limits?: SetupPlayerLimits | undefined;
  }): ValidationResult {
    const positions = [...currentPositions, candidate];
    const full = this.validateFormation({
      positions,
      isTeam1,
      availablePlayerCount,
      limits,
    });
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
    if (availablePlayerCount < activeRules().setup.minOnLineOfScrimmage) {
      restrictions.push({
        id: "short-handed-line",
        satisfied: this.isOnCentreLineOfScrimmage(
          candidate.x,
          candidate.y,
          isTeam1
        ),
        satisfiable: true,
        message: SHORT_HANDED_MESSAGE,
      });
    }
    return setupValidation(restrictions);
  }

  canConfirmSetup(
    positions: FormationPosition[],
    isTeam1: boolean,
    availablePlayerCount: number
  ): boolean {
    return this.validateFormation({ positions, isTeam1, availablePlayerCount })
      .valid;
  }

  validateFormation({
    positions,
    isTeam1,
    availablePlayerCount = this.config.maxPlayers,
    limits,
  }: FormationInput): ValidationResult {
    const requiredPlayerCount =
      limits?.minimum ??
      Math.min(this.config.maxPlayers, Math.max(0, availablePlayerCount));
    const maximumPlayerCount = limits?.maximum ?? requiredPlayerCount;
    const positionKeys = positions.map(
      (pos) => `${String(pos.x)},${String(pos.y)}`
    );
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
    return setupValidation(
      setupRestrictions({
        placedCount: positions.length,
        uniqueCount: uniquePositionCount,
        requiredCount: requiredPlayerCount,
        maximumCount: maximumPlayerCount,
        configuredMaximum: this.config.maxPlayers,
        availableCount: availablePlayerCount,
        wideCounts,
        onCentreLos,
        inNeutralZone,
        inSetupArea,
        minOnLos: activeRules().setup.minOnLineOfScrimmage,
        maxPerWideZone: activeRules().setup.maxPerWideZone,
      })
    );
  }

  isPositionOccupied(
    x: number,
    y: number,
    placedPositions: FormationPosition[]
  ): boolean {
    return placedPositions.some((pos) => pos.x === x && pos.y === y);
  }
}
