import { type HeadlessCommand, type PendingDecision } from "../../headless/protocol";
import { type BlockResultType } from "../../services/BlockResolutionService";
import { SkillType, hasSkill } from "../../types/Skills";
import { type Candidate } from "../candidates";
import {
  type Board,
  type FieldPlayer,
  carrierOf,
  distance,
  key,
  middleRow,
  toGoal,
} from "./board";
import { hasBiteSupport, isThrall } from "./feeding";
import { inducementChoice } from "./inducementChoices";
import { type PushLanding, pushLandingAt } from "../../game/rules/pitchSquares";
import { blockFaces, defenderWrestles, takesWrestle } from "./wrestle";

const USE_REROLL = "use-reroll";

const UNRELIABLE = [
  SkillType.ANIMAL_SAVAGERY,
  SkillType.BONE_HEAD,
  SkillType.REALLY_STUPID,
  SkillType.TAKE_ROOT,
  SkillType.UNCHANNELLED_FURY,
  SkillType.LONER,
];

type PendingOf<T extends PendingDecision["type"]> = Extract<
  PendingDecision,
  { type: T }
>;

function first(
  candidates: readonly Candidate[],
  test: (c: Candidate) => boolean
): number | null {
  const index = candidates.findIndex((candidate) => test(candidate));
  return index === -1 ? null : index;
}

function best(
  candidates: readonly Candidate[],
  score: (c: Candidate) => number | undefined
): number | null {
  let pick: number | null = null;
  let pickScore = -Infinity;
  for (const [i, c] of candidates.entries()) {
    const value = score(c);
    if (value === undefined || !(value > pickScore)) {
      continue;
    }

    pickScore = value;
    pick = i;
  }
  return pick;
}

const blitzing = (board: Board) =>
  board.gs.getState().activePlayer?.action === "blitz";

function keptFace(
  pending: PendingOf<"block-dice">,
  rank: (type: BlockResultType) => number
): BlockResultType | null {
  let kept: BlockResultType | null = null;
  for (const o of pending.options) {
    if (
      kept === null ||
      (pending.choiceStage === "attacker-reroll"
        ? rank(o.type) < rank(kept)
        : rank(o.type) > rank(kept))
    )
      kept = o.type;
  }
  return kept;
}

function blockDiceChoice(
  board: Board,
  pending: PendingOf<"block-dice">,
  candidates: readonly Candidate[]
): number | null {
  const attacker = board.everyone.find((p) => p.id === pending.attackerId);
  const defender = board.everyone.find((p) => p.id === pending.defenderId);
  if (!attacker || !defender)
    throw new Error("Block decision players must be on the pitch");
  const faces = blockFaces(board, {
    attacker,
    defender,
    blitz: blitzing(board),
  });
  const rank = (type: BlockResultType) => faces[type].rank;
  const weAttack = attacker.teamId === board.us;
  const kept = keptFace(pending, rank);

  if (weAttack && kept !== null && faces[kept].attackerDown) {
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
    if (command.type !== "choose-block-result") return;
    const option = pending.options[command.index];
    if (!option) return;
    const r = rank(option.type);
    return weAttack ? r : -r;
  });
}

const OFF_PITCH_PUSH: Record<Exclude<PushLanding, "pitch">, number> = {
  crowd: 200,
  pit: 200,
  wall: 100,
};

function pushChoice(
  board: Board,
  pending: PendingOf<"push-direction">,
  candidates: readonly Candidate[]
): number | null {
  const defender = board.gs.getPlayerById(pending.defenderId);
  const from = defender?.gridPosition;
  const pushingThem = defender?.teamId !== board.us;
  return best(candidates, (c) => {
    const command = c.commands[0];
    if (command.type !== "choose-push-direction" || !from) return;
    const square = { x: command.x, y: command.y };
    const landing = pushLandingAt(from, square);
    if (landing !== "pitch") return pushingThem ? OFF_PITCH_PUSH[landing] : NaN;
    const wide = Math.abs(square.y - middleRow()) * 2;
    return pushingThem ? wide : -wide - board.marks.getUint8(key(square));
  });
}

function keepsFood(board: Board, attacker: FieldPlayer | undefined): boolean {
  return (
    !!attacker &&
    !!board.gs.getState().activePlayer?.bloodlustUnsated &&
    hasBiteSupport(board, attacker, attacker.gridPosition)
  );
}

function followUpChoice(
  board: Board,
  candidates: readonly Candidate[]
): number | null {
  const carrier = carrierOf(board);
  const active = board.gs.getState().activePlayer;
  const attacker = board.everyone.find((player) => player.id === active?.id);
  const holding = carrier && carrier.id === attacker?.id;
  const corner =
    carrier &&
    attacker &&
    carrier.teamId === board.us &&
    carrier.id !== attacker.id &&
    distance(carrier.gridPosition, attacker.gridPosition) === 1;
  const follow = !holding && !corner && !keepsFood(board, attacker);
  return first(
    candidates,
    (c) =>
      c.commands[0].type === "choose-follow-up" &&
      c.commands[0].followUp === follow
  );
}

function touchbackChoice(
  board: Board,
  candidates: readonly Candidate[]
): number | null {
  return best(candidates, (c) => {
    const command = c.commands[0];
    if (command.type !== "touchback") return;
    const p = board.gs.getPlayerById(command.playerId);
    if (!p?.gridPosition) return;
    const unreliable = UNRELIABLE.some((skill) => hasSkill(p.skills, skill));
    return (
      -board.marks.getUint8(key(p.gridPosition)) * 10 -
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
      (c) => c.commands[0].type === USE_REROLL && !c.commands[0].accept
    );
  return (
    find(
      (c) =>
        c.commands[0].type === USE_REROLL &&
        c.commands[0].accept &&
        c.commands[0].source !== "team"
    ) ?? find((c) => c.commands[0].type === USE_REROLL && c.commands[0].accept)
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

interface SkillReactionChoiceArgs {
  board: Board;
  pending: PendingOf<"reaction">;
  candidates: readonly Candidate[];
  skillPlans: boolean;
}

function skillReactionChoice({
  board,
  pending,
  candidates,
  skillPlans,
}: SkillReactionChoiceArgs): number | null {
  if (pending.skill === SkillType.WRESTLE)
    return wrestleChoice(board, pending, candidates);
  if (!skillPlans || pending.skill !== SkillType.BLOODLUST) return null;
  const player = board.ours.find((p) => p.id === pending.playerId);
  if (!player) return null;
  const declines = pending.prompt.includes("change the declared action")
    ? keepsFedAction(board, player)
    : sparesCarrier(board, player);
  return declines
    ? first(
        candidates,
        (c) => c.commands[0].type === "use-reaction" && !c.commands[0].accept
      )
    : null;
}

function keepsFedAction(board: Board, player: FieldPlayer): boolean {
  const action = board.gs.getState().activePlayer?.action;
  return (
    !!action &&
    KEEPS_ACTION_WHEN_FED.has(action) &&
    hasBiteSupport(board, player, player.gridPosition)
  );
}

function wrestleChoice(
  board: Board,
  pending: PendingOf<"reaction">,
  candidates: readonly Candidate[]
): number | null {
  const attacker = board.everyone.find(
    (p) => p.id === board.gs.getState().activePlayer?.id
  );
  const self = board.everyone.find((p) => p.id === pending.playerId);
  if (!attacker || !self) return null;
  const defender = board.everyone.find((p) => p.id === pending.opponentId);
  const accept =
    self.id === attacker.id
      ? !!defender && takesWrestle(board, self, defender)
      : defenderWrestles(attacker, self);
  return first(
    candidates,
    (c) =>
      c.commands[0].type === "use-reaction" && c.commands[0].accept === accept
  );
}

function sparesCarrier(board: Board, player: FieldPlayer): boolean {
  const thralls = board.ours.filter(
    (p) => isThrall(p) && distance(p.gridPosition, player.gridPosition) === 1
  );
  return thralls.length === 1 && thralls[0]?.id === carrierOf(board)?.id;
}

const KEEPS_ACTION_WHEN_FED = new Set<string>(["gaze", "block"]);

interface DecideArgs {
  board: Board;
  pending: PendingDecision;
  candidates: readonly Candidate[];
  skillPlans?: boolean;
}

export function decide({
  board,
  pending,
  candidates,
  skillPlans = true,
}: DecideArgs): number | null {
  if (isOtherDecision(pending))
    return otherDecision(board, pending, candidates);
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
      return skillReactionChoice({
        board: board,
        pending: pending,
        candidates: candidates,
        skillPlans: skillPlans,
      });
  }
}

function otherDecision(
  board: Board,
  pending: PendingOf<
    | "interception"
    | "apothecary"
    | "foul-assists"
    | "inducement-choice"
    | "kickoff-event"
    | "reserve-move"
    | "cross-assist"
  >,
  candidates: readonly Candidate[]
): number | null {
  const find = (test: (c: Candidate) => boolean) => first(candidates, test);
  switch (pending.type) {
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
    case "inducement-choice":
      return inducementChoice(board, pending, candidates);
    case "cross-assist":
      return find((c) => lendsNobody(c.commands[0]));
    case "kickoff-event":
    case "foul-assists":
    case "reserve-move":
      return null;
  }
}

function lendsNobody(command: HeadlessCommand): boolean {
  return (
    command.type === "lend-assists" &&
    command.toAttacker.length === 0 &&
    command.toDefender.length === 0
  );
}

function isOtherDecision(
  pending: PendingDecision
): pending is PendingOf<
  | "interception"
  | "apothecary"
  | "foul-assists"
  | "inducement-choice"
  | "kickoff-event"
  | "reserve-move"
  | "cross-assist"
> {
  return (
    pending.type === "interception" ||
    pending.type === "apothecary" ||
    pending.type === "foul-assists" ||
    pending.type === "inducement-choice" ||
    pending.type === "kickoff-event" ||
    pending.type === "reserve-move" ||
    pending.type === "cross-assist"
  );
}
