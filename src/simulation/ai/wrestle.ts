import { type Player, PlayerCondition, hasCondition } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import {
  type BlockResultType,
  BlockResolutionService,
} from "../../services/BlockResolutionService";
import { type Board, type Square, carrierOf, key, neighbours } from "./board";
import { pushBackSquares } from "../../game/rules/jump";
import {
  type PushLanding,
  isOpenPushSquare,
  pushLandingAt,
} from "../../game/rules/pitchSquares";

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
  knockdown: number;
  attackerDown: boolean;
}

export type BlockFaces = Record<BlockResultType, BlockFace>;

export interface Matchup {
  attacker: Player;
  defender: Player;
  blitz?: boolean;
}

export function blockFaces(board: Board, matchup: Matchup): BlockFaces {
  const { attacker, defender } = matchup;
  const dodges =
    has(defender, SkillType.DODGE) && !has(attacker, SkillType.TACKLE);
  const pushed = pushFace(pinnedLanding(board, matchup));
  return {
    pow: { rank: 5, knockdown: 1, attackerDown: false },
    "pow-dodge": dodges
      ? pushed
      : { rank: 4.5, knockdown: 1, attackerDown: false },
    push: pushed,
    "both-down": bothDownFace(board, matchup, pushed),
    skull: { rank: 0, knockdown: 0, attackerDown: true },
  };
}

function bothDownFace(
  board: Board,
  { attacker, defender, blitz }: Matchup,
  pushed: BlockFace
): BlockFace {
  const juggernaut = !!blitz && has(attacker, SkillType.JUGGERNAUT);
  const wrestled =
    takesWrestle(board, attacker, defender) ||
    (!juggernaut && defenderWrestles(attacker, defender));
  if (wrestled) {
    const value = wrestleValue(board, attacker, defender);
    const fallsHungry = hungry(board, attacker);
    return {
      rank: fallsHungry ? value - 0.1 : value,
      knockdown: 1,
      attackerDown: value === 0 || fallsHungry,
    };
  }
  if (juggernaut) return pushed;
  const aBlock = has(attacker, SkillType.BLOCK);
  const dBlock = has(defender, SkillType.BLOCK);
  return {
    rank: bothDownRank(aBlock, dBlock),
    knockdown: Number(!dBlock),
    attackerDown: !aBlock,
  };
}

type Pinned = Exclude<PushLanding, "pitch">;

const WALL_FALL = 1 / 2;

function pushFace(pinned: Pinned | null): BlockFace {
  if (pinned === null) return { rank: 3, knockdown: 0, attackerDown: false };
  if (pinned === "wall")
    return { rank: 3.5, knockdown: WALL_FALL, attackerDown: false };
  return { rank: 4.4, knockdown: 1, attackerDown: false };
}

function taken(board: Board, attacker: Player, square: Square): boolean {
  const at = attacker.gridPosition;
  if (at?.x === square.x && at.y === square.y) return true;
  const there = board.occupant[key(square)];
  return !!there && there.id !== attacker.id;
}

function anySquareOpen(
  board: Board,
  { attacker, defender, blitz }: Matchup
): boolean {
  const from = defender.gridPosition;
  if (!from) return false;
  const sidesteps =
    has(defender, SkillType.SIDESTEP) &&
    !hasCondition(defender, PlayerCondition.DISTRACTED);
  const grabs = has(attacker, SkillType.GRAB) && !blitz;
  const widened = sidesteps || grabs;
  return (
    widened &&
    neighbours(from).some(
      (square) =>
        isOpenPushSquare(from, square) && !taken(board, attacker, square)
    )
  );
}

function immovable({ attacker, defender, blitz }: Matchup): boolean {
  if (hasCondition(defender, PlayerCondition.ROOTED)) return true;
  const juggernaut = !!blitz && has(attacker, SkillType.JUGGERNAUT);
  const distracted = hasCondition(defender, PlayerCondition.DISTRACTED);
  return has(defender, SkillType.STAND_FIRM) && !juggernaut && !distracted;
}

function pinnedLanding(board: Board, matchup: Matchup): Pinned | null {
  const { attacker, defender } = matchup;
  const from = defender.gridPosition;
  const by = attacker.gridPosition;
  if (!from || !by || immovable(matchup)) return null;
  if (anySquareOpen(board, matchup)) return null;
  let landing: Pinned | null = null;
  for (const square of pushBackSquares(by, from)) {
    const kind = pushLandingAt(from, square);
    if (kind === "pitch") {
      if (!taken(board, attacker, square)) return null;
    } else if (landing === null || landing === "wall") landing = kind;
  }
  return landing;
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
    odds.knockdown += weight * face.knockdown;
    if (!face.attackerDown) return;
    odds.attackerDown += weight;
    odds.both += weight * face.knockdown;
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
