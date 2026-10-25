/**
 * Halfling Master Chef (2025 rulebook p.149): at the start of each half,
 * before the Kick-off, the team rolls three D6. For each 4+ it gains a
 * Team Re-roll for the half and the opposition loses one.
 *
 * The swing is stored on the match state for the current half, and
 * teamRerolls.ts applies it to each team's allowance. Rolled at most once
 * per half, and only once a team actually holds a chef.
 */

import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { GameState } from "../../types/GameState";
import { Inducement } from "../../types/Inducements";
import { Team } from "../../types/Team";
import { DiceController } from "../controllers/DiceController";
import { currentHalf } from "../teamRerolls";
import { inducementCount } from "./inventory";

export function rollMasterChefs(
  state: GameState,
  teams: [Team, Team],
  dice: DiceController,
  eventBus: IEventBus
): void {
  const inducements = state.inducements;
  const half = currentHalf(state);
  if (!inducements || inducements.masterChef?.half === half) return;
  const cooks = teams.filter(
    (team) =>
      inducementCount(state, team.id, Inducement.HALFLING_MASTER_CHEF) > 0
  );
  if (cooks.length === 0) return;

  const rerolls: Record<string, number> = {
    [teams[0].id]: 0,
    [teams[1].id]: 0,
  };
  for (const team of cooks) {
    const opponent = team.id === teams[0].id ? teams[1] : teams[0];
    const stolen = dice
      .rollMultipleD6(`Halfling Master Chef (${team.name})`, 3, team.id)
      .filter((roll) => roll >= 4).length;
    rerolls[team.id] += stolen;
    rerolls[opponent.id] -= stolen;
    eventBus.emit(
      GameEventNames.UI_GameLog,
      `Halfling Master Chef — ${team.name} takes ${stolen} team re-roll(s) from ${opponent.name} this half`
    );
  }
  inducements.masterChef = { half, rerolls };
}
