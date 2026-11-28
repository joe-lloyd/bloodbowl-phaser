import { describe, expect, it } from "vitest";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { GamePhase } from "../../src/types/GameState";
import { PlayerStatus, type Player } from "../../src/types/Player";
import { SkillType, getSkill } from "../../src/types/Skills";
import { forceDice } from "../utils/test-helpers";
import { choose, rehearse, settle } from "./kickoffRehearsal";

const SKULL = 1;
const BOTH_DOWN = 2;
const POW = 6;
const PASSED = 6;
const FAILED = 1;

const INERT_SKILLS = [
  SkillType.SURE_HANDS,
  SkillType.CATCH,
  SkillType.KICK,
  SkillType.NERVES_OF_STEEL,
  SkillType.PASS,
  SkillType.ACCURATE,
  SkillType.STRONG_ARM,
  SkillType.SAFE_PASS,
  SkillType.DIVING_CATCH,
  SkillType.CANNONEER,
];

const FALL_KINDS = ["defender", "both-down", "skull", "rush", "dodge"] as const;

type Fall = (typeof FALL_KINDS)[number];

interface Board {
  game: HeadlessGame;
  attacker: Player;
  defender: Player;
}

const unanswered = Symbol("unanswered");

function answered<T>(work: Promise<T>): Promise<T | typeof unanswered> {
  return Promise.race([
    work,
    new Promise<typeof unanswered>((resolve) =>
      setTimeout(() => {
        resolve(unanswered);
      }, 1000)
    ),
  ]);
}

function declare(
  game: HeadlessGame,
  player: Player,
  action: "move" | "blitz" | "block"
) {
  return game.execute({ type: "declare-action", playerId: player.id, action });
}

async function walk(game: HeadlessGame, player: Player, xs: readonly number[]) {
  const y = player.gridPosition?.y ?? 0;
  for (const x of xs)
    await game.execute({ type: "move", playerId: player.id, path: [{ x, y }] });
}

async function blockWith(board: Board, dice: readonly number[]) {
  const { game, attacker, defender } = board;
  forceDice(game.ctx.rng, [...dice]);
  await game.execute({
    type: "block",
    attackerId: attacker.id,
    defenderId: defender.id,
  });
  return game.execute({ type: "choose-block-result", index: 0 });
}

async function blitzAfterFullMove(board: Board, face: number) {
  const { game, attacker } = board;
  attacker.gridPosition = { x: 2, y: 1 };
  board.defender.gridPosition = { x: 10, y: 1 };
  await declare(game, attacker, "blitz");
  forceDice(game.ctx.rng, [PASSED]);
  await walk(game, attacker, [3, 4, 5, 6, 7, 8, 9]);
  return blockWith(board, [PASSED, face]);
}

async function failRush({ game, attacker }: Board) {
  attacker.gridPosition = { x: 2, y: 1 };
  await declare(game, attacker, "move");
  forceDice(game.ctx.rng, [FAILED]);
  await walk(game, attacker, [3, 4, 5, 6, 7, 8]);
  return walk(game, attacker, [9]);
}

async function failDodge({ game, attacker, defender }: Board) {
  attacker.gridPosition = { x: 9, y: 1 };
  defender.gridPosition = { x: 10, y: 1 };
  await declare(game, attacker, "move");
  forceDice(game.ctx.rng, [FAILED]);
  return walk(game, attacker, [8]);
}

async function answerPush(game: HeadlessGame) {
  const direction = game.pendingDecision();
  if (direction?.type === "push-direction") {
    const [square] = direction.options;
    if (square)
      await game.execute({
        type: "choose-push-direction",
        x: square.x,
        y: square.y,
      });
  }
  if (game.pendingDecision()?.type === "follow-up")
    await game.execute({ type: "choose-follow-up", followUp: false });
}

const FALLS: Record<Fall, (board: Board) => Promise<unknown>> = {
  defender: (board) => {
    board.attacker.skills.push(getSkill(SkillType.BLOCK));
    return blitzAfterFullMove(board, BOTH_DOWN);
  },
  "both-down": (board) => blitzAfterFullMove(board, BOTH_DOWN),
  skull: (board) => blitzAfterFullMove(board, SKULL),
  rush: failRush,
  dodge: failDodge,
};

async function freeTurn(event: KickoffEvent, attackerSkills: number) {
  const { game, home, away } = await rehearse(event, { players: 1 });
  game.ctx.teams[0].rerolls = 0;
  const attacker = home(1);
  attacker.skills = INERT_SKILLS.slice(0, attackerSkills).map((skill) =>
    getSkill(skill)
  );
  away(1).skills = [];
  away(3).status = PlayerStatus.PRONE;
  await choose(game, [attacker.id]);
  return { game, attacker, defender: away(1), sleeper: away(3) };
}

async function receiversStandUp(game: HeadlessGame, sleeper: Player) {
  await settle();
  const { phase, activeTeamId } = game.ctx.gameService.getState();
  await game.execute({
    type: "declare-action",
    playerId: sleeper.id,
    action: "move",
  });
  const stood = await answered(
    game.execute({ type: "stand-up", playerId: sleeper.id })
  );
  return {
    phase,
    activeTeamId,
    stood: stood === unanswered ? "hung" : stood.ok,
    sleeper: sleeper.status,
  };
}

const PLAYED_ON = {
  phase: GamePhase.PLAY,
  activeTeamId: "team2",
  stood: true,
  sleeper: PlayerStatus.ACTIVE,
};

const SKILL_COUNTS = Array.from(
  { length: INERT_SKILLS.length + 1 },
  (_, count) => count
);

describe.each([KickoffEvent.CHARGE, KickoffEvent.BLITZ])(
  "a fall during %s",
  (event) => {
    it.each(FALL_KINDS)(
      "ends the free turn and lets the receivers play on (%s)",
      async (fall) => {
        const outcomes = [];
        for (const count of SKILL_COUNTS) {
          const { sleeper, ...board } = await freeTurn(event, count);
          await FALLS[fall](board);
          outcomes.push(await receiversStandUp(board.game, sleeper));
        }
        expect(outcomes).toEqual(SKILL_COUNTS.map(() => PLAYED_ON));
      }
    );
  }
);

describe("a knock-down from the Quick Attack block", () => {
  it.each([
    { face: POW, fell: "defender" },
    { face: BOTH_DOWN, fell: "both" },
    { face: SKULL, fell: "attacker" },
  ])(
    "lets the receivers play on when the $fell went down",
    async ({ face }) => {
      const outcomes = [];
      for (const count of SKILL_COUNTS) {
        const { sleeper, ...board } = await freeTurn(
          KickoffEvent.QUICK_ATTACK,
          count
        );
        board.attacker.gridPosition = { x: 9, y: 1 };
        board.defender.gridPosition = { x: 10, y: 1 };
        await declare(board.game, board.attacker, "block");
        await blockWith(board, [face]);
        await answerPush(board.game);
        outcomes.push(await receiversStandUp(board.game, sleeper));
      }
      expect(outcomes).toEqual(SKILL_COUNTS.map(() => PLAYED_ON));
    }
  );
});
