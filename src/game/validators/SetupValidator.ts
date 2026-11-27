import {
  activeLayout,
  activeRules,
  pairFrame,
} from "../variants/activeMatch";
import { obstacleAt } from "../variants/pitchLayouts";
import {
  type Frame,
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

type FrameFormation = Omit<FormationInput, "isTeam1"> & { frame: Frame };

const onCentreLine = (frame: Frame, square: { x: number; y: number }) =>
  onScrimmage(frame, square) && inCentreStrip(frame, square);

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
    return this.inSetupZone(pairFrame(isTeam1), { x, y });
  }

  private inSetupZone(frame: Frame, { x, y }: { x: number; y: number }) {
    if (
      x < 0 ||
      x >= this.config.pitchWidth ||
      y < 0 ||
      y >= this.config.pitchHeight ||
      obstacleAt(activeLayout(), { x, y })
    ) {
      return false;
    }
    return inSetupSection(frame, { x, y });
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

  validatePlacement({
    candidate,
    currentPositions,
    frame,
    availablePlayerCount,
    limits,
  }: {
    candidate: FormationPosition;
    currentPositions: FormationPosition[];
    frame: Frame;
    availablePlayerCount: number;
    limits?: SetupPlayerLimits | undefined;
  }): ValidationResult {
    const positions = [...currentPositions, candidate];
    const full = this.validateFrameFormation({
      positions,
      frame,
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
    const { minOnLineOfScrimmage } = activeRules().setup;
    if (availablePlayerCount < minOnLineOfScrimmage) {
      restrictions.push({
        id: "short-handed-line",
        satisfied: onCentreLine(frame, candidate),
        satisfiable: true,
        message: shortHandedMessage(minOnLineOfScrimmage),
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

  validateFormation({ isTeam1, ...rest }: FormationInput): ValidationResult {
    return this.validateFrameFormation({ ...rest, frame: pairFrame(isTeam1) });
  }

  validateFrameFormation({
    positions,
    frame,
    availablePlayerCount = this.config.maxPlayers,
    limits,
  }: FrameFormation): ValidationResult {
    const requiredPlayerCount =
      limits?.minimum ??
      Math.min(this.config.maxPlayers, Math.max(0, availablePlayerCount));
    const maximumPlayerCount = limits?.maximum ?? requiredPlayerCount;
    const positionKeys = positions.map(
      (pos) => `${String(pos.x)},${String(pos.y)}`
    );
    const uniquePositionCount = new Set(positionKeys).size;
    const wideCounts = { top: 0, bottom: 0 };
    for (const pos of positions) {
      const zone = wideZoneOf(frame, pos);
      if (zone !== null) wideCounts[WIDE_ZONES[zone]]++;
    }
    const onCentreLos = positions.filter((pos) =>
      onCentreLine(frame, pos)
    ).length;
    const inNeutralZone = positions.some((pos) => inNoMansLand(frame, pos));
    const inSetupArea = positions.every((pos) => this.inSetupZone(frame, pos));
    const rules = activeRules().setup;
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
        minOnLos: rules.minOnLineOfScrimmage,
        maxPerWideZone: rules.maxPerWideZone,
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
