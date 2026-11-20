import { type Player, PlayerCondition, hasCondition } from "../../types/Player";
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
    !hasCondition(defender, PlayerCondition.DISTRACTED) &&
    has(attacker, SkillType.BLOCK) &&
    !has(defender, SkillType.BLOCK)
  );
}

interface BlockFace {
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
  const fallsHungry = wrestled && hungry(board, attacker);
  return {
    pow: { rank: 5, knockdown: true, attackerDown: false },
    "pow-dodge": dodges
      ? { rank: 3, knockdown: false, attackerDown: false }
      : { rank: 4.5, knockdown: true, attackerDown: false },
    push: { rank: 3, knockdown: false, attackerDown: false },
    "both-down": wrestled
      ? {
          rank: fallsHungry ? value - 0.1 : value,
          knockdown: true,
          attackerDown: value === 0 || fallsHungry,
        }
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
): { knockdown: number; attackerDown: number; both: number } {
  const rolled = DIE_FACES.map((type) => faces[type]);
  const odds = { knockdown: 0, attackerDown: 0, both: 0 };
  const tally = (face: BlockFace, weight: number) => {
    if (face.knockdown) odds.knockdown += weight;
    if (face.attackerDown) odds.attackerDown += weight;
    if (face.knockdown && face.attackerDown) odds.both += weight;
  };
  const visit = (left: number, chosen: BlockFace | null, weight: number) => {
    if (left === 0) {
      if (chosen) tally(chosen, weight);
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
  return odds;
}
