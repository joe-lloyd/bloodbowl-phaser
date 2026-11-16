/**
 * Answers to the decisions a turn raises mid-action: block dice, re-rolls,
 * push squares, follow-ups and the rest. Each returns an index into the
 * offered candidates, or null to let the heuristic coach answer.
 */

import { PendingDecision } from "../../headless/protocol";
import { BlockResultType } from "../../services/BlockResolutionService";
import { SkillType, hasSkill } from "../../types/Skills";
import { Candidate } from "../candidates";
import { Board, carrierOf, distance, key, onPitch, toGoal } from "./board";
import { hasBiteSupport } from "./feeding";

/** Traits that can stop a player acting on its turn. */
const UNRELIABLE = [
  SkillType.ANIMAL_SAVAGERY,
  SkillType.BONE_HEAD,
  SkillType.REALLY_STUPID,
  SkillType.TAKE_ROOT,
  SkillType.UNCHANNELLED_FURY,
  SkillType.LONER,
];

/** How good a block result is for the attacker. */
function resultRank(
  type: BlockResultType,
  attackerBlock: boolean,
  defenderBlock: boolean,
  defenderDodge: boolean
): number {
  switch (type) {
    case "pow":
      return 5;
    case "pow-dodge":
      return defenderDodge ? 3 : 4.5;
    case "push":
      return 3;
    case "both-down":
      if (attackerBlock && !defenderBlock) return 4;
      if (attackerBlock) return 2.5;
      return defenderBlock ? 0.5 : 1;
    case "skull":
      return 0;
  }
}

type PendingOf<T extends PendingDecision["type"]> = Extract<
  PendingDecision,
  { type: T }
>;

/** The index of the first candidate that passes `test`, or null. */
function first(
  candidates: readonly Candidate[],
  test: (c: Candidate) => boolean
): number | null {
  const index = candidates.findIndex(test);
  return index >= 0 ? index : null;
}

/**
 * The first candidate with the highest score, or null when none has one.
 * `score` returns undefined for a candidate that is not in the running.
 */
function best(
  candidates: readonly Candidate[],
  score: (c: Candidate) => number | undefined
): number | null {
  let pick: number | null = null;
  let pickScore = -Infinity;
  candidates.forEach((c, i) => {
    const value = score(c);
    if (value !== undefined && value > pickScore) {
      pickScore = value;
      pick = i;
    }
  });
  return pick;
}

function blockDiceChoice(
  board: Board,
  pending: PendingOf<"block-dice">,
  candidates: readonly Candidate[]
): number | null {
  const gs = board.gs;
  const attacker = gs.getPlayerById(pending.attackerId)!;
  const defender = gs.getPlayerById(pending.defenderId)!;
  const has = (p: typeof attacker, s: SkillType) => hasSkill(p.skills, s);
  const rank = (type: BlockResultType) =>
    resultRank(
      type,
      has(attacker, SkillType.BLOCK),
      has(defender, SkillType.BLOCK),
      has(defender, SkillType.DODGE) && !has(attacker, SkillType.TACKLE)
    );
  const weAttack = attacker.teamId === board.us;
  const ranks = pending.options.map((o) => rank(o.type));
  // At the attacker's re-roll stage the defender picks, so the worst die
  // is the one that counts.
  const counts =
    pending.choiceStage === "attacker-reroll"
      ? Math.min(...ranks)
      : Math.max(...ranks);
  // Re-roll a block that would put our attacker down, if we can.
  if (weAttack && counts <= 1) {
    const reroll =
      first(candidates, (c) => c.commands[0].type === "veteran-reroll-block") ??
      first(candidates, (c) => c.commands[0].type === "brawler-reroll-block") ??
      first(candidates, (c) => c.commands[0].type === "team-reroll-block");
    if (reroll !== null) return reroll;
  }
  if (pending.choiceStage === "attacker-reroll")
    return first(candidates, (c) => c.commands[0].type === "keep-block-dice");
  return best(candidates, (c) => {
    const command = c.commands[0];
    if (command.type !== "choose-block-result") return undefined;
    const r = rank(pending.options[command.index].type);
    return weAttack ? r : -r;
  });
}

/**
 * Pushing their player: off the pitch if we can, else towards the
 * sideline. Pushed ourselves (Sidestep): towards the middle.
 */
function pushChoice(
  board: Board,
  pending: PendingOf<"push-direction">,
  candidates: readonly Candidate[]
): number | null {
  const pushingThem =
    board.gs.getPlayerById(pending.defenderId)?.teamId !== board.us;
  return best(candidates, (c) => {
    const command = c.commands[0];
    if (command.type !== "choose-push-direction") return undefined;
    const square = { x: command.x, y: command.y };
    const wide = !onPitch(square) ? 100 : Math.abs(square.y - 5) * 2;
    return pushingThem ? wide : -wide - board.marks[key(square)];
  });
}

/** Stay put when we hold the ball or keep a cage corner; else follow. */
function followUpChoice(
  board: Board,
  candidates: readonly Candidate[]
): number | null {
  const gs = board.gs;
  const carrier = carrierOf(board);
  const active = gs.getState().activePlayer;
  const attacker = active ? gs.getPlayerById(active.id) : undefined;
  const holding = carrier && attacker && carrier.id === attacker.id;
  const corner =
    carrier &&
    attacker &&
    carrier.teamId === board.us &&
    carrier.id !== attacker.id &&
    distance(carrier.gridPosition!, attacker.gridPosition!) === 1;
  const follow = !holding && !corner;
  return first(
    candidates,
    (c) =>
      c.commands[0].type === "choose-follow-up" &&
      c.commands[0].followUp === follow
  );
}

/**
 * The ball to a ball handler out of trouble: never a big guy who may
 * refuse to act, the quicker and surer-handed the better.
 */
function touchbackChoice(
  board: Board,
  candidates: readonly Candidate[]
): number | null {
  return best(candidates, (c) => {
    const command = c.commands[0];
    if (command.type !== "touchback") return undefined;
    const p = board.gs.getPlayerById(command.playerId);
    if (!p?.gridPosition) return undefined;
    const unreliable = UNRELIABLE.some((skill) => hasSkill(p.skills, skill));
    return (
      -board.marks[key(p.gridPosition)] * 10 -
      (unreliable ? 30 : 0) +
      p.stats.MA -
      p.stats.AG * 2 -
      toGoal(board, p.gridPosition) * 0.1
    );
  });
}

function rerollChoice(
  pending: PendingOf<"reroll">,
  candidates: readonly Candidate[],
  skillPlans: boolean
): number | null {
  const find = (test: (c: Candidate) => boolean) => first(candidates, test);
  if (skillPlans && pending.rollKind === "gaze")
    return find(
      (c) => c.commands[0].type === "use-reroll" && !c.commands[0].accept
    );
  return (
    find(
      (c) =>
        c.commands[0].type === "use-reroll" &&
        c.commands[0].accept &&
        c.commands[0].source !== "team"
    ) ??
    find((c) => c.commands[0].type === "use-reroll" && c.commands[0].accept)
  );
}

function biteChoice(
  board: Board,
  candidates: readonly Candidate[]
): number | null {
  const carrier = carrierOf(board)?.id;
  const bitten = (c: Candidate) =>
    c.commands[0].type === "choose-bite-target"
      ? c.commands[0].playerId
      : undefined;
  return (
    first(candidates, (c) => !!bitten(c) && bitten(c) !== carrier) ??
    first(candidates, (c) => !!bitten(c))
  );
}

function skillReactionChoice(
  board: Board,
  pending: PendingOf<"reaction">,
  candidates: readonly Candidate[],
  skillPlans: boolean
): number | null {
  const active = board.gs.getState().activePlayer;
  const player = active ? board.gs.getPlayerById(active.id) : undefined;
  if (
    skillPlans &&
    pending.skill === SkillType.BLOODLUST &&
    pending.prompt.includes("change the declared action") &&
    active?.action === "gaze" &&
    player?.gridPosition &&
    hasBiteSupport(board, player, player.gridPosition)
  )
    return first(
      candidates,
      (c) => c.commands[0].type === "use-reaction" && !c.commands[0].accept
    );
  return null;
}

export function decide(
  board: Board,
  pending: PendingDecision,
  candidates: readonly Candidate[],
  skillPlans = true
): number | null {
  const find = (test: (c: Candidate) => boolean) => first(candidates, test);
  switch (pending.type) {
    case "block-dice":
      return blockDiceChoice(board, pending, candidates);
    case "reroll":
      return rerollChoice(pending, candidates, skillPlans);
    case "push-direction":
      return pushChoice(board, pending, candidates);
    case "follow-up":
      return followUpChoice(board, candidates);
    case "touchback":
      return touchbackChoice(board, candidates);
    case "bite-target":
      return biteChoice(board, candidates);
    case "reaction":
      return skillReactionChoice(board, pending, candidates, skillPlans);
    case "interception":
      return find(
        (c) =>
          c.commands[0].type === "choose-interception" &&
          !!c.commands[0].playerId
      );
    case "apothecary":
      return find(
        (c) => c.commands[0].type === "use-apothecary" && c.commands[0].accept
      );
    default:
      return null;
  }
}
