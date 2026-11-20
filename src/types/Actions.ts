import { type Player } from "./Player";

export interface BlockAnalysis {
  diceCount: number;
  isUphill: boolean;
  attackerST: number;
  defenderST: number;
  barricadeCover: boolean;
  attackerAssists: Player[];
  defenderAssists: Player[];
}
