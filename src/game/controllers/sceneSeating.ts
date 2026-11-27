import type { GameScene } from "../../scenes/GameScene";
import { type Seating, seatTeams } from "../seating";
import { activeLayout } from "../variants/activeMatch";

export function sceneSeating(scene: Pick<GameScene, "team1" | "team2">): Seating {
  return seatTeams([scene.team1, scene.team2], activeLayout());
}
