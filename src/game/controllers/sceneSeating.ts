import type { GameScene } from "../../scenes/GameScene";
import { type Seating, seatTeams } from "../seating";
import { activeLayout } from "../variants/activeMatch";

export function sceneSeating(scene: Pick<GameScene, "teams">): Seating {
  return seatTeams(scene.teams, activeLayout());
}
