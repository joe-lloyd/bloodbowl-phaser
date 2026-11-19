import { type Player } from "./Player";

export interface BlockAnalysis {
  diceCount: number;
  isUphill: boolean;
  attackerST: number;
  defenderST: number;
  attackerAssists: Player[];
  defenderAssists: Player[];
}
