import { type Player } from "../../types/Player";

export class ArmourController {
  public isArmourBroken(player: Player, roll: number): boolean {
    const target = player.stats.AV;

    return roll >= target;
  }
}
