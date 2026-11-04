/**
 * Answers to the decisions a turn raises mid-action: block dice, re-rolls,
 * push squares, follow-ups and the rest. Each returns an index into the
 * offered candidates, or null to let the heuristic coach answer.
 */

import { PendingDecision } from "../../headless/protocol";
import { BlockResultType } from "../../services/BlockResolutionService";
import { SkillType, hasSkill } from "../../types/Skills";
import { Candidate } from "../candidates";
import {
  Board,
  carrierOf,
  distance,
  edge,
  key,
  onPitch,
  toGoal,
} from "./board";

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

export function decide(
  board: Board,
  pending: PendingDecision,
  candidates: readonly Candidate[]
): number | null {
  const find = (test: (c: Candidate) => boolean) => {
    const index = candidates.findIndex(test);
    return index >= 0 ? index : null;
  };
  const gs = board.gs;
  switch (pending.type) {
    case "block-dice": {
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
      const best =
        pending.choiceStage === "attacker-reroll"
          ? Math.min(...ranks)
          : Math.max(...ranks);
      // Re-roll a block that would put our attacker down, if we can, or that
      // leaves their carrier on its feet with the ball on the pitch.
      const carrier = carrierOf(board);
      const missedCarrier =
        carrier?.id === defender.id &&
        carrier.teamId !== board.us &&
        best < (edge(defender.gridPosition!) ? 3 : 4);
      if (weAttack && (best <= 1 || missedCarrier)) {
        const reroll =
          find((c) => c.commands[0].type === "veteran-reroll-block") ??
          find((c) => c.commands[0].type === "brawler-reroll-block") ??
          find((c) => c.commands[0].type === "team-reroll-block");
        if (reroll !== null) return reroll;
      }
      if (pending.choiceStage === "attacker-reroll")
        return find((c) => c.commands[0].type === "keep-block-dice");
      let pick: number | null = null;
      let pickScore = -Infinity;
      candidates.forEach((c, i) => {
        const command = c.commands[0];
        if (command.type !== "choose-block-result") return;
        const r = rank(pending.options[command.index].type);
        const score = weAttack ? r : -r;
        if (score > pickScore) {
          pickScore = score;
          pick = i;
        }
      });
      return pick;
    }
    case "reroll": {
      // A failed roll here is almost always a turnover: take any re-roll,
      // a skill's before the team's.
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
    case "push-direction": {
      // Pushing their player: off the pitch if we can, else towards the
      // sideline. Pushed ourselves (Sidestep): towards the middle.
      const pushingThem =
        gs.getPlayerById(pending.defenderId)?.teamId !== board.us;
      let pick: number | null = null;
      let pickScore = -Infinity;
      candidates.forEach((c, i) => {
        const command = c.commands[0];
        if (command.type !== "choose-push-direction") return;
        const square = { x: command.x, y: command.y };
        const wide = !onPitch(square) ? 100 : Math.abs(square.y - 5) * 2;
        const score = pushingThem ? wide : -wide - board.marks[key(square)];
        if (score > pickScore) {
          pickScore = score;
          pick = i;
        }
      });
      return pick;
    }
    case "follow-up": {
      // Stay put when we hold the ball or keep a cage corner; else follow.
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
      return find(
        (c) =>
          c.commands[0].type === "choose-follow-up" &&
          c.commands[0].followUp === follow
      );
    }
    case "touchback": {
      // The ball to a ball handler out of trouble: never a big guy who
      // may refuse to act, the quicker and surer-handed the better.
      let pick: number | null = null;
      let pickScore = -Infinity;
      candidates.forEach((c, i) => {
        const command = c.commands[0];
        if (command.type !== "touchback") return;
        const p = gs.getPlayerById(command.playerId);
        if (!p?.gridPosition) return;
        const unreliable = UNRELIABLE.some((skill) =>
          hasSkill(p.skills, skill)
        );
        const score =
          -board.marks[key(p.gridPosition)] * 10 -
          (unreliable ? 30 : 0) +
          p.stats.MA -
          p.stats.AG * 2 -
          toGoal(board, p.gridPosition) * 0.1;
        if (score > pickScore) {
          pickScore = score;
          pick = i;
        }
      });
      return pick;
    }
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
