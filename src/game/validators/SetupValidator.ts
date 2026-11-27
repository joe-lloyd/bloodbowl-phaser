import { activeLayout, activeRules, pairFrame } from "../variants/activeMatch";
import { obstacleAt } from "../variants/pitchLayouts";
import {
  blockOf,
  inCentreStrip,
  inNoMansLand,
  inSetupSection,
  onScrimmage,
  wideZoneOf,
} from "../rules/frames";
import { WIDE_ZONES } from "../kickoff/driveEffects";
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
  shortHandedMessage,
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
    return inSetupSection(pairFrame(isTeam1), { x, y });
  }

  getSetupZone(isTeam1: boolean): SetupZone {
    const frame = pairFrame(isTeam1);
    const { arm } = frame;
    const { min, max } = blockOf(
      frame,
      { min: 0, max: arm.scrimmage },
      arm.setupAcross
    );
    return {
      minX: min.x,
      maxX: max.x,
      minY: 0,
      maxY: this.config.pitchHeight - 1,
    };
  }

  isOnCentreLineOfScrimmage(x: number, y: number, isTeam1: boolean): boolean {
    const frame = pairFrame(isTeam1);
    return onScrimmage(frame, { x, y }) && inCentreStrip(frame, { x, y });
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
        message: shortHandedMessage(activeRules().setup.minOnLineOfScrimmage),
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
    const frame = pairFrame(isTeam1);
    const wideCounts = { top: 0, bottom: 0 };
    for (const pos of positions) {
      const zone = wideZoneOf(frame, pos);
      if (zone !== null) wideCounts[WIDE_ZONES[zone]]++;
    }
    const onCentreLos = positions.filter((pos) =>
      this.isOnCentreLineOfScrimmage(pos.x, pos.y, isTeam1)
    ).length;
    const inNeutralZone = positions.some((pos) => inNoMansLand(frame, pos));
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
