import { describe, it, expect } from "vitest";
import { tacticalGame } from "../../scripts/coach/policy-lab/fixtures";
import { readBoard, key } from "../../src/simulation/ai/board";
import { context } from "../../src/simulation/ai/activationContext";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import { canStillScore } from "../../src/simulation/ai/latePlans";
import { handoffActivations } from "../../src/simulation/ai/ballActivations";
import { secureBallActivations } from "../../src/simulation/ai/skillActivations";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { chain } from "../../src/simulation/ai/chance";
import type { Route } from "../../src/simulation/ai/routes";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createCoachRng } from "../../src/simulation/rng";
import { SkillType } from "../../src/types/Skills";

// Literal route alternatives isolate pricing from the path search. The public
// activation builder must price the catch and finish from one shared reroll.
describe("policy review controls", () => {
  it("prices each scoring finish with the catch before choosing its route", () => {
    const game = tacticalGame(
      {
        teamRerolls: { team1: 1, team2: 0 },
        team1Placements: [
          { playerIndex: 0, x: 17, y: 5, hasBall: true, stats: { MA: 1 } },
          {
            playerIndex: 1,
            x: 18,
            y: 5,
            stats: { AG: 6 },
            skills: [SkillType.DODGE],
          },
        ],
      },
      { opponentTurnsPlayed: 6 }
    );
    const [carrier, receiver] = game.ctx.team1.players;
    const c = context(
      readBoard(game, carrier.teamId),
      DEFAULT_WEIGHTS,
      new Map([
        [carrier.id, new Set(["handoff" as const])],
        [receiver.id, new Set(["move" as const])],
      ])
    );
    const routes = new Map<number, Route>([
      [
        key({ x: 19, y: 4 }),
        {
          to: { x: 19, y: 4 },
          path: [{ x: 19, y: 4 }],
          rolls: [{ kind: "rush", target: 2 }],
          chance: chain(receiver, [{ kind: "rush", target: 2 }], true),
        },
      ],
      [
        key({ x: 19, y: 5 }),
        {
          to: { x: 19, y: 5 },
          path: [{ x: 19, y: 5 }],
          rolls: [{ kind: "dodge", target: 2 }],
          chance: chain(receiver, [{ kind: "dodge", target: 2 }], true),
        },
      ],
    ]);
    const lookup = c.routes;
    c.routes = (player) =>
      player.id === receiver.id ? routes : lookup(player);
    expect(handoffActivations(c, carrier)[0].value).toBeCloseTo(
      (385 / 1296) * 100 - 1,
      10
    );
  });

  it("does not invent a final-turn transfer from an already activated carrier", async () => {
    const game = tacticalGame({
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, hasBall: true, stats: { MA: 1, PA: 2 } },
        { playerIndex: 1, x: 19, y: 5 },
      ],
    });
    const [carrier, receiver] = game.ctx.team1.players;
    await game.execute({
      type: "declare-action",
      playerId: carrier.id,
      action: "move",
    });
    await game.execute({ type: "end-activation", playerId: carrier.id });
    const board = readBoard(game, carrier.teamId);
    const available = new Map([[receiver.id, new Set(["move" as const])]]);
    expect(canStillScore(board, available)).toBe(false);
    expect(canStillScore({ ...board, turnsLeft: 1 }, available)).toBe(true);
  });

  it.each([
    { spent: false, expected: 1225 / 1296 },
    { spent: true, expected: 25 / 27 },
  ])(
    "prices both securing and pickup with spent Dodge=$spent",
    ({ spent, expected }) => {
      const game = tacticalGame({
        teamRerolls: { team1: 1, team2: 0 },
        team1Placements: [
          {
            playerIndex: 0,
            x: 16,
            y: 5,
            stats: { AG: 2 },
            skills: [SkillType.DODGE],
          },
        ],
        team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
        ballPosition: { x: 19, y: 5 },
      });
      const player = game.ctx.team1.players[0];
      if (spent)
        game.ctx.gameService
          .getRerollArbiter()
          .consumeSkillReroll(player, SkillType.DODGE);
      const c = context(
        readBoard(game, player.teamId),
        DEFAULT_WEIGHTS,
        new Map([[player.id, new Set(["secureBall" as const])]])
      );
      const plans = secureBallActivations(c, player);
      expect(plans).toHaveLength(1);
      expect(plans[0].intent.kind).toBe("secure-ball");
      if (plans[0].intent.kind !== "secure-ball")
        throw new Error("Expected securing route");
      expect(plans[0].intent.route.chance).toBeCloseTo(expected, 12);
    }
  );

  it("reprices retained positioning without borrowing the team reroll", async () => {
    const game = tacticalGame({
      turn: 1,
      teamRerolls: { team1: 1, team2: 0 },
      team1Placements: [
        {
          playerIndex: 0,
          x: 7,
          y: 5,
          stats: { AG: 2 },
          skills: [SkillType.DODGE],
        },
      ],
      team2Placements: [
        { playerIndex: 0, x: 7, y: 6 },
        { playerIndex: 1, x: 8, y: 6 },
      ],
    });
    const player = game.ctx.team1.players[0];
    const rolls = [{ kind: "dodge" as const, target: 2 }];
    const route: Route = {
      to: { x: 9, y: 5 },
      path: [
        { x: 8, y: 5 },
        { x: 9, y: 5 },
      ],
      rolls,
      chance: chain(player, rolls, false),
    };
    const coach = createPlannerCoach();
    await game.execute({
      type: "declare-action",
      playerId: player.id,
      action: "move",
    });
    coach.remember(game, {
      player,
      action: "move",
      intent: { kind: "reposition", role: "receiver", route },
      tier: "support",
      value: 999,
      rolls,
    });
    game.ctx.gameService
      .getRerollArbiter()
      .consumeSkillReroll(player, SkillType.DODGE);
    const point = await enumerateDecision(game, null);
    const choice = await coach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    });
    expect(point.candidates[choice.index].commands[0]).toEqual({
      type: "end-activation",
      playerId: player.id,
    });
  });
});
