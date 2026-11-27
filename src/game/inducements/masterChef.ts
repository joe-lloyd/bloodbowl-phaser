import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { type GameState } from "../../types/GameState";
import { Inducement } from "../../types/Inducements";
import { type PairSeating, pairTeams } from "../seating";
import { DiceController } from "../controllers/DiceController";
import { currentHalf } from "../teamRerolls";
import { inducementCount } from "./inventory";

export function rollMasterChefs(
  state: GameState,
  seating: PairSeating,
  dice: DiceController,
  eventBus: IEventBus
): void {
  const inducements = state.inducements;
  const half = currentHalf(state);
  if (!inducements || inducements.masterChef?.half === half) return;
  const [home, away] = pairTeams(seating);
  const cooks = [home, away].filter(
    (team) =>
      inducementCount(state, team.id, Inducement.HALFLING_MASTER_CHEF) > 0
  );
  if (cooks.length === 0) return;

  const rerolls: Record<string, number> = {
    [home.id]: 0,
    [away.id]: 0,
  };
  for (const team of cooks) {
    const opponent = team.id === home.id ? away : home;
    const stolen = dice
      .rollMultipleD6(`Halfling Master Chef (${team.name})`, 3, team.id)
      .filter((roll) => roll >= 4).length;
    rerolls[team.id] = (rerolls[team.id] ?? 0) + stolen;
    rerolls[opponent.id] = (rerolls[opponent.id] ?? 0) - stolen;
    eventBus.emit(
      GameEventNames.UI_GameLog,
      `Halfling Master Chef — ${team.name} takes ${String(stolen)} team re-roll(s) from ${opponent.name} this half`
    );
  }
  inducements.masterChef = { half, rerolls };
}
