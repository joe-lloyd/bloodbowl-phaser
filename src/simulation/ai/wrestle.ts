import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import {
  type BlockResultType,
  BlockResolutionService,
} from "../../services/BlockResolutionService";
import { type Board, carrierOf } from "./board";

const has = (p: Player, skill: SkillType) => hasSkill(p.skills, skill);

function bothDownRank(attackerBlock: boolean, defenderBlock: boolean): number {
  if (attackerBlock && !defenderBlock) return 4;
  if (attackerBlock) return 2.5;
  return defenderBlock ? 0.5 : 1;
}

function wrestleValue(
  board: Board,
  attacker: Player,
  defender: Player
): number {
  const carrier = carrierOf(board)?.id;
  if (carrier === attacker.id) return 0;
  return carrier === defender.id ? 4.5 : 2;
}

function hungry(board: Board, attacker: Player): boolean {
  const active = board.gs.getState().activePlayer;
  return active?.id === attacker.id && !!active.bloodlustUnsated;
}

export function takesWrestle(
  board: Board,
  attacker: Player,
  defender: Player
): boolean {
  const aBlock = has(attacker, SkillType.BLOCK);
  const dBlock = has(defender, SkillType.BLOCK);
  return (
    has(attacker, SkillType.WRESTLE) &&
    (!aBlock || dBlock) &&
    !(aBlock && hungry(board, attacker)) &&
    wrestleValue(board, attacker, defender) > bothDownRank(aBlock, dBlock)
  );
}

export function defenderWrestles(attacker: Player, defender: Player): boolean {
  return (
    has(defender, SkillType.WRESTLE) &&
    has(attacker, SkillType.BLOCK) &&
    !has(defender, SkillType.BLOCK)
  );
}

export interface BlockFace {
  rank: number;
  knockdown: boolean;
  attackerDown: boolean;
}

export type BlockFaces = Record<BlockResultType, BlockFace>;

export function blockFaces(
  board: Board,
  attacker: Player,
  defender: Player
): BlockFaces {
  const aBlock = has(attacker, SkillType.BLOCK);
  const dBlock = has(defender, SkillType.BLOCK);
  const dodges =
    has(defender, SkillType.DODGE) && !has(attacker, SkillType.TACKLE);
  const wrestled =
    takesWrestle(board, attacker, defender) ||
    defenderWrestles(attacker, defender);
  const value = wrestleValue(board, attacker, defender);
  return {
    pow: { rank: 5, knockdown: true, attackerDown: false },
    "pow-dodge": dodges
      ? { rank: 3, knockdown: false, attackerDown: false }
      : { rank: 4.5, knockdown: true, attackerDown: false },
    push: { rank: 3, knockdown: false, attackerDown: false },
    "both-down": wrestled
      ? { rank: value, knockdown: true, attackerDown: value === 0 }
      : {
          rank: bothDownRank(aBlock, dBlock),
          knockdown: !dBlock,
          attackerDown: !aBlock,
        },
    skull: { rank: 0, knockdown: false, attackerDown: true },
  };
}

const DIE_FACES = [1, 2, 3, 4, 5, 6].map(
  (roll) => BlockResolutionService.mapRollToResult(roll).type
);

export function pickedFaceOdds(
  faces: BlockFaces,
  dice: number,
  attackerPicks: boolean
): { knockdown: number; attackerDown: number } {
  const rolled = DIE_FACES.map((type) => faces[type]);
  let knockdown = 0;
  let attackerDown = 0;
  const visit = (left: number, chosen: BlockFace | null, weight: number) => {
    if (left === 0) {
      if (chosen?.knockdown) knockdown += weight;
      if (chosen?.attackerDown) attackerDown += weight;
      return;
    }
    for (const face of rolled) {
      const better =
        !chosen ||
        (attackerPicks ? face.rank > chosen.rank : face.rank < chosen.rank);
      visit(left - 1, better ? face : chosen, weight / rolled.length);
    }
  };
  visit(Math.max(1, dice), null, 1);
  return { knockdown, attackerDown };
}
