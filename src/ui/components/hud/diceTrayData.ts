import type { BlockResultType } from "../../../services/BlockResolutionService";
import type { GameEventMap } from "../../../services/EventBus";
import type { GameEventNames } from "../../../types/events";
import type { DiceRoll, DiceTeam } from "../../dice/diceScene";
import { ServiceContainer } from "../../../services/ServiceContainer";
import type { Team, TeamColors } from "../../../types/Team";
import { kitOf } from "../../../game/presentation/kits";
import { isBlockDice, isD6, isD16 } from "../../dice/thrownDice";
type RollEvent = GameEventMap[typeof GameEventNames.DiceRoll];

export const BLOCK_VALUE: Record<BlockResultType, number> = {
  skull: 1,
  "both-down": 2,
  push: 3,
  "pow-dodge": 5,
  pow: 6,
};

export function asList<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

export function toDice(event: RollEvent): Omit<DiceRoll, "team"> | null {
  const values = asList(event.value);
  if (isBlockDice(event.diceType)) {
    const faces = values.map((value) => blockValue(value));
    return faces.every((face): face is number => face !== undefined)
      ? { kind: "block", values: faces }
      : null;
  }
  if (isD6(event.diceType) || isD16(event.diceType)) {
    const sides = isD16(event.diceType) ? 16 : 6;
    const pips = values.map(Number);
    return pips.length > 0 &&
      pips.every((v) => Number.isSafeInteger(v) && v >= 1 && v <= sides)
      ? { kind: sides === 16 ? "d16" : "d6", values: pips }
      : null;
  }
  return null;
}

export function teamLook(teamId?: string): DiceTeam | null {
  if (!ServiceContainer.isInitialized()) return null;
  const { gameService } = ServiceContainer.getInstance();
  const rollerId = teamId ?? gameService.getActiveTeamId();
  if (!rollerId) return null;
  const team = gameService.getTeam(rollerId);
  if (!team) return null;
  return diceTeam(team, kitOf(gameService.getTeams(), team.id));
}

export function diceTeam(team: Team, kit: TeamColors): DiceTeam {
  return {
    key: team.id,
    race: team.rosterName.split(" ", 1).join("").toLowerCase(),
    initial: team.name.charAt(0).toUpperCase(),
    primary: kit.primary,
    secondary: kit.secondary,
  };
}

function blockValue(value: string | number): number | undefined {
  const name = String(value);
  const entry = Object.entries(BLOCK_VALUE).find(([face]) => face === name);
  return entry?.[1];
}
