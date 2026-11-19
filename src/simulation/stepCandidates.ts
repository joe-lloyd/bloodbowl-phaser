import { HeadlessGame } from "../headless/HeadlessGame";
import { type GridPosition, type HeadlessCommand } from "../headless/protocol";
import { type GameState } from "../types/GameState";
import {
  type Player,
  PlayerCondition,
  PlayerStatus,
  hasCondition,
} from "../types/Player";
import { PassController } from "../game/controllers/PassController";
import { weatherEffects } from "../game/rules/weather";
import { legalHandoffTargets } from "../game/rules/handoff";
import { legalBlockReplacementTargets } from "../game/rules/blockReplacements";
import { GameConfig } from "../config/GameConfig";
import { jumpTargets } from "../game/rules/jump";
import { moveAllowance } from "../game/skills/movement";
import { withDriveModifiers } from "../game/kickoff/driveEffects";
import { hasSkill, SkillType } from "../types/Skills";
import {
  SWOOP_FACINGS,
  isRightStuffEligible,
  throwTeammateAims,
} from "../game/rules/throwTeammate";
import type { Candidate } from "./candidates";

const chebyshev = (a: GridPosition, b: GridPosition) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export const square = (p: GridPosition) => `(${String(p.x)},${String(p.y)})`;

const onPitch = (p: GridPosition) =>
  p.x >= 0 &&
  p.x < GameConfig.PITCH_WIDTH &&
  p.y >= 0 &&
  p.y < GameConfig.PITCH_HEIGHT;

export function describePlayer(player: Player): string {
  const where = player.gridPosition ? ` at ${square(player.gridPosition)}` : "";
  return `${player.positionName} #${String(player.number)}${where}`;
}

interface StepContext {
  gs: HeadlessGame["ctx"]["gameService"];
  state: GameState;
  player: Player;
  at: GridPosition;
  active: NonNullable<GameState["activePlayer"]>;
  action: NonNullable<GameState["activePlayer"]>["action"];
  opponents: Player[];
  adjacent: Player[];
  carrying: boolean;
  replacementPending: boolean;
  step: (command: HeadlessCommand, label: string) => void;
}

function ballAndChainSteps({ player, at, action, step }: StepContext): void {
  if (action !== "ballAndChain" || player.status !== PlayerStatus.ACTIVE)
    return;

  for (const facing of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]) {
    const toward = { x: at.x + facing.x, y: at.y + facing.y };
    step(
      { type: "ball-and-chain", playerId: player.id, ...facing },
      `${describePlayer(player)} lurches towards ${square(toward)}`
    );
  }
}

const STANDS_TO_ACT = new Set<StepContext["action"]>([
  "standUp",
  "blitz",
  "gaze",
]);

function standUpSteps({ player, action, step }: StepContext): void {
  if (STANDS_TO_ACT.has(action) && player.status === PlayerStatus.PRONE) {
    step(
      { type: "stand-up", playerId: player.id },
      `${describePlayer(player)} stands up`
    );
  }
}

function moveSteps({ gs, player, at, action, step }: StepContext): void {
  if (
    action === "block" ||
    action === "multipleBlock" ||
    (action === "standUp" && player.status === PlayerStatus.PRONE) ||
    action === "ballAndChain" ||
    isDirectReplacement(action)
  )
    return;
  for (const target of gs.getAvailableMovements(player.id)) {
    if (chebyshev(target, at) !== 1) continue;
    step(
      {
        type: "move",
        playerId: player.id,
        path: [{ x: target.x, y: target.y }],
      },
      `${describePlayer(player)} steps to ${square(target)}`
    );
  }
}

function canJump({ gs, state, player, action }: StepContext): boolean {
  const movesWithJumps =
    action === "move" ||
    action === "blitz" ||
    action === "pass" ||
    action === "handoff" ||
    action === "foul";
  return (
    movesWithJumps &&
    player.status === PlayerStatus.ACTIVE &&
    !hasCondition(player, PlayerCondition.ROOTED) &&
    !hasCondition(player, PlayerCondition.CHOMPED) &&
    gs.getMovementUsed(player.id) + 2 <=
      moveAllowance(withDriveModifiers(player, state))
  );
}

function jumpSteps(ctx: StepContext): void {
  if (!canJump(ctx)) return;
  const { gs, player, at, opponents, step } = ctx;
  const others = [...gs.getTeammates(player.id), ...opponents];
  const canJumpAnything =
    hasSkill(player.skills, SkillType.LEAP) ||
    hasSkill(player.skills, SkillType.POGO);
  for (const target of jumpTargets(at, others, canJumpAnything, (x, y) =>
    onPitch({ x, y })
  )) {
    step(
      {
        type: "jump",
        playerId: player.id,
        x: target.dest.x,
        y: target.dest.y,
      },
      `${describePlayer(player)} jumps over ${square(target.over)} to ${square(target.dest)}`
    );
  }
}

function blockSteps(ctx: StepContext): void {
  const { gs, player, action, adjacent, replacementPending, step } = ctx;
  const canBlock =
    player.status === PlayerStatus.ACTIVE &&
    !replacementPending &&
    (action === "block" ||
      (action === "blitz" && !gs.hasUsedBlitzBlock(player.id)));
  if (!canBlock) return;
  for (const target of adjacent.filter(
    (o) => o.status === PlayerStatus.ACTIVE
  )) {
    step(
      { type: "block", attackerId: player.id, defenderId: target.id },
      `${describePlayer(player)} blocks ${describePlayer(target)}`
    );
  }
}

function multipleBlockSteps({
  player,
  action,
  adjacent,
  step,
}: StepContext): void {
  if (
    action !== "multipleBlock" ||
    player.status !== PlayerStatus.ACTIVE ||
    !hasSkill(player.skills, SkillType.MULTIPLE_BLOCK)
  )
    return;
  const targets = adjacent.filter((p) => p.status === PlayerStatus.ACTIVE);
  targets.forEach((first, i) => {
    for (const second of targets.slice(i + 1)) {
      step(
        {
          type: "multiple-block",
          attackerId: player.id,
          defender1Id: first.id,
          defender2Id: second.id,
        },
        `${describePlayer(player)} blocks ${describePlayer(first)} and ${describePlayer(second)}`
      );
    }
  });
}

function gazeSteps({ player, action, adjacent, step }: StepContext): void {
  if (
    action !== "gaze" ||
    player.status !== PlayerStatus.ACTIVE ||
    !hasSkill(player.skills, SkillType.HYPNOTIC_GAZE)
  )
    return;
  for (const target of adjacent.filter(
    (p) => p.status === PlayerStatus.ACTIVE
  )) {
    step(
      {
        type: "special-action",
        action: "gaze",
        attackerId: player.id,
        defenderId: target.id,
      },
      `${describePlayer(player)} gazes at ${describePlayer(target)}`
    );
  }
}

function replacementSteps(ctx: StepContext): void {
  const { player, active, opponents, replacementPending, step } = ctx;
  if (!replacementPending || player.status !== PlayerStatus.ACTIVE) return;
  const replacement = active.blockReplacement!;
  for (const target of legalBlockReplacementTargets(
    player,
    opponents,
    replacement
  )) {
    step(
      replacement === "stab"
        ? { type: "stab", attackerId: player.id, defenderId: target.id }
        : {
            type: "special-action",
            action: replacement,
            attackerId: player.id,
            defenderId: target.id,
          },
      `${describePlayer(player)} uses ${replacement} on ${describePlayer(target)}`
    );
  }
}

function isPassSquare(
  { gs, at }: StepContext,
  passTypes: readonly string[],
  to: GridPosition
): boolean {
  if (to.x === at.x && to.y === at.y) return false;
  if (PassController.rangeValue(at, to) === null) return false;
  const range = gs.getPassController().measureRange(at, to);
  return passTypes.includes(range.type);
}

function passSteps(ctx: StepContext): void {
  const { gs, state, player, action, carrying, opponents, step } = ctx;

  if (action !== "pass" || !carrying) return;

  const everyone = [...gs.getTeammates(player.id), ...opponents];

  const { passTypes } = weatherEffects(state.weather);
  for (let x = 0; x < GameConfig.PITCH_WIDTH; x++) {
    for (let y = 0; y < GameConfig.PITCH_HEIGHT; y++) {
      if (!isPassSquare(ctx, passTypes, { x, y })) continue;
      const there = everyone.find(
        (p) => p.gridPosition?.x === x && p.gridPosition?.y === y
      );
      step(
        { type: "pass", playerId: player.id, x, y },
        there
          ? `${describePlayer(player)} passes to ${describePlayer(there)}`
          : `${describePlayer(player)} passes to the empty square ${square({ x, y })}`
      );
    }
  }
}

function handoffSteps({
  gs,
  player,
  action,
  carrying,
  step,
}: StepContext): void {
  if (action !== "handoff" || !carrying) return;
  for (const mate of legalHandoffTargets(player, gs.getTeammates(player.id))) {
    step(
      { type: "handoff", playerId: player.id, targetId: mate.id },
      `${describePlayer(player)} hands off to ${describePlayer(mate)}`
    );
  }
}

function foulSteps({ player, action, adjacent, step }: StepContext): void {
  if (action !== "foul") return;
  for (const target of adjacent.filter(
    (o) => o.status === PlayerStatus.PRONE || o.status === PlayerStatus.STUNNED
  )) {
    step(
      { type: "foul", playerId: player.id, ...target.gridPosition! },
      `${describePlayer(player)} fouls ${describePlayer(target)}`
    );
  }
}

function throwableMates(
  gs: StepContext["gs"],
  player: Player,
  at: GridPosition
): Player[] {
  return gs
    .getTeammates(player.id)
    .filter(
      (m) =>
        m.status === PlayerStatus.ACTIVE &&
        m.gridPosition &&
        chebyshev(m.gridPosition, at) === 1 &&
        isRightStuffEligible(m)
    );
}

const swoopFacings = (mate: Player) =>
  hasSkill(mate.skills, SkillType.SWOOP)
    ? [undefined, ...SWOOP_FACINGS]
    : [undefined];

function throwTeammateSteps({
  gs,
  player,
  at,
  action,
  step,
}: StepContext): void {
  if (action !== "throwTeamMate" || player.status !== PlayerStatus.ACTIVE)
    return;
  const aims = throwTeammateAims(at);
  for (const mate of throwableMates(gs, player, at))
    for (const swoopFacing of swoopFacings(mate))
      for (const aim of aims)
        step(
          {
            type: "throw-teammate",
            throwerId: player.id,
            teammateId: mate.id,
            ...aim,
            ...(swoopFacing ? { swoopFacing } : {}),
          },
          `${describePlayer(player)} throws ${describePlayer(mate)} at ${square(aim)}${swoopFacing ? `, swooping ${swoopFacing}` : ""}`
        );
}

const STEP_PASSES = [
  ballAndChainSteps,
  standUpSteps,
  moveSteps,
  jumpSteps,
  blockSteps,
  multipleBlockSteps,
  gazeSteps,
  replacementSteps,
  passSteps,
  handoffSteps,
  foulSteps,
  throwTeammateSteps,
];

export function stepCandidates(
  game: HeadlessGame,
  player: Player,
  active: NonNullable<GameState["activePlayer"]>
): Candidate[] {
  const gs = game.ctx.gameService;
  const state = gs.getState();
  const at = player.gridPosition;
  const out: Candidate[] = [];

  if (at) {
    const opponents = gs
      .getOpponents(player.teamId)
      .filter((o) => o.gridPosition);
    const ctx: StepContext = {
      gs,
      state,
      player,
      at,
      active,
      action: active.action,
      opponents,
      adjacent: opponents.filter((o) => chebyshev(o.gridPosition!, at) === 1),
      carrying:
        !!state.ballPosition &&
        state.ballPosition.x === at.x &&
        state.ballPosition.y === at.y,
      replacementPending:
        !!active.blockReplacement && !active.blockReplacementUsed,
      step: (command, label) =>
        out.push({ kind: "step", commands: [command], label }),
    };
    for (const pass of STEP_PASSES) pass(ctx);
  }

  out.push({
    kind: "end-activation",
    commands: [{ type: "end-activation", playerId: player.id }],
    label: `${describePlayer(player)} ends their activation`,
  });
  return out;
}

function isDirectReplacement(action: string | null): boolean {
  return (
    action === "stab" ||
    action === "chainsaw" ||
    action === "breatheFire" ||
    action === "chomp" ||
    action === "vomit"
  );
}
