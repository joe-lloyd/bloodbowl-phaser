import { type Player, hasTackleZone } from "@/types/Player";

export class CatchController {
  public calculateModifiers(
{ position,opponents,isBounce=false,isThrowIn=false }: { position: { x: number; y: number; }; opponents: Player[]; isBounce?: boolean; isThrowIn?: boolean; }  ): number {
    let modifier = 0;

    if (isBounce || isThrowIn) {
      modifier -= 1;
    }

    modifier -= this.countMarkingOpponents(position, opponents);

    return modifier;
  }

  public countMarkingOpponents(
    position: { x: number; y: number },
    opponents: Player[]
  ): number {
    let count = 0;

    for (const opponent of opponents) {
      if (!opponent.gridPosition || !hasTackleZone(opponent)) {
        continue;
      }

      const dx = Math.abs(opponent.gridPosition.x - position.x);
      const dy = Math.abs(opponent.gridPosition.y - position.y);

      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
        count++;
      }
    }

    return count;
  }
}
