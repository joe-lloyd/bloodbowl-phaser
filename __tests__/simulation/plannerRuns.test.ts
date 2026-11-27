import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { RosterName } from "../../src/types/Team";
import { runMatch } from "../../src/simulation/runMatch";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType, getSkill } from "../../src/types/Skills";
import { createTestPlayer } from "../fixtures/players";
import { fieldPlayer } from "./fixtures";
import { casualtyChance, chain } from "../../src/simulation/ai/chance";
import { key, readBoard } from "../../src/simulation/ai/board";
import { routesFor } from "../../src/simulation/ai/routes";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createCoachRng } from "../../src/simulation/rng";

const die = (type: "pow" | "skull") => ({ type, icon: "", label: type });

describe("the planner's scoring run", () => {
  it("never abandons a run it has started for a carrier step", async () => {
    const recording = await runMatch({
      seed: 10,
      rerolls: 0,
      inducements: false,
      rosters: [RosterName.ORC, RosterName.HUMAN],
      coaches: [plannerCoach, heuristicCoach],
    });
    const abandoned = recording.steps.filter(
      (step, i) =>
        i > 0 &&
        step.command.type === "move" &&
        step.note?.startsWith("moves the ball carrier") &&
        fixtureValue(recording.steps[i - 1]).command.type === "move" &&
        fixtureValue(recording.steps[i - 1]).note?.startsWith(
          "runs in to score"
        )
    );
    expect(abandoned.map((step) => step.label)).toEqual([]);
  }, 60_000);
});

describe("the planner's touchback", () => {
  it("gives the ball to a ball handler, not a player who may refuse to act", async () => {
    const game = new HeadlessGame({
      scenario: {
        id: "planner-touchback",
        name: "Planner touchback",
        description: "",
        setup: {
          team1Placements: [
            { playerIndex: 0, x: 3, y: 5, skills: [SkillType.REALLY_STUPID] },
            { playerIndex: 1, x: 2, y: 2 },
          ],
          team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        },
      },
      seed: 1,
    });
    game.adoptPending({ type: "touchback", teamId: game.ctx.teams[0].id });
    const point = await enumerateDecision(game, null);
    const { index } = await plannerCoach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    });
    expect(fixtureValue(point.candidates[index]).commands[0]).toEqual({
      type: "touchback",
      playerId: fixtureValue(game.ctx.teams[0].players[1]).id,
    });
  });
});

describe("the planner's dice maths", () => {
  it("does not re-roll a skill-re-rolled roll again with a team re-roll", () => {
    const dodger = createTestPlayer({ skills: [getSkill(SkillType.DODGE)] });

    expect(
      chain({
        player: dodger,
        rolls: [{ kind: "dodge", target: 3 }],
        teamReroll: true,
      })
    ).toBeCloseTo(8 / 9, 6);
  });

  it("prices a casualty from the armour and the Sevens injury table", () => {
    const player = (av: number, ...skills: SkillType[]) =>
      createTestPlayer({
        stats: { ...createTestPlayer().stats, AV: av },
        skills: skills.map((skill) => getSkill(skill)),
      });

    expect(casualtyChance(player(9), player(9))).toBeCloseTo(60 / 1296, 9);

    expect(
      casualtyChance(player(9, SkillType.MIGHTY_BLOW), player(9))
    ).toBeCloseTo(130 / 1296, 9);

    expect(
      casualtyChance(player(9, SkillType.CLAWS), player(10, SkillType.STUNTY))
    ).toBeCloseTo((15 / 36) * (10 / 36), 9);

    expect(
      casualtyChance(
        player(9, SkillType.CLAWS, SkillType.MIGHTY_BLOW),
        player(10)
      )
    ).toBeCloseTo(150 / 1296, 9);

    expect(
      casualtyChance(
        player(9, SkillType.CLAWS, SkillType.MIGHTY_BLOW),
        player(9, SkillType.IRON_HARD_SKIN)
      )
    ).toBeCloseTo(100 / 1296, 9);

    expect(
      casualtyChance(player(9), player(9, SkillType.REGENERATION))
    ).toBeCloseTo(30 / 1296, 9);
  });
});

describe("the planner's skill re-roll", () => {
  it("is still there for the second dodge if the first one passes", () => {
    const dodger = createTestPlayer({ skills: [getSkill(SkillType.DODGE)] });
    const dodges = [
      { kind: "dodge", target: 3 },
      { kind: "dodge", target: 3 },
    ] as const;

    expect(
      chain({ player: dodger, rolls: dodges, teamReroll: false })
    ).toBeCloseTo(20 / 27, 6);
  });
});

describe("the planner's dodge past a Tackle", () => {
  it("does not count on a Dodge re-roll the rules deny", () => {
    const dodger = createTestPlayer({ skills: [getSkill(SkillType.DODGE)] });
    const roll = { kind: "dodge", target: 3, noSkillReroll: true } as const;
    expect(
      chain({ player: dodger, rolls: [roll], teamReroll: false })
    ).toBeCloseTo(2 / 3, 6);
  });

  it("marks the roll when the square left is in a Tackle zone", () => {
    const game = new HeadlessGame({
      scenario: {
        id: "planner-tackle",
        name: "Planner tackle",
        description: "",
        setup: {
          team1Placements: [
            { playerIndex: 0, x: 7, y: 5, skills: [SkillType.DODGE] },
          ],
          team2Placements: [
            { playerIndex: 0, x: 8, y: 5, skills: [SkillType.TACKLE] },
          ],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          ballPosition: { x: 1, y: 1 },
        },
      },
      seed: 1,
    });
    const board = readBoard(game, game.ctx.teams[0].id);
    const route = routesFor({
      board: board,
      player: fieldPlayer(game.ctx.teams[0].players[0]),
    }).get(key({ x: 5, y: 5 }));
    expect(route?.chance).toBeCloseTo(2 / 3, 6);
  });
});

describe("the planner's block re-roll", () => {
  it("re-rolls uphill dice when the defender could take a Skull", async () => {
    const game = new HeadlessGame({
      scenario: {
        id: "planner-uphill",
        name: "Planner uphill",
        description: "",
        setup: {
          team1Placements: [{ playerIndex: 0, x: 7, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 8, y: 5 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        },
      },
      seed: 1,
    });
    game.adoptPending({
      type: "block-dice",
      attackerId: fixtureValue(game.ctx.teams[0].players[0]).id,
      defenderId: fixtureValue(game.ctx.teams[1].players[0]).id,
      chooserTeamId: game.ctx.teams[1].id,
      options: [die("pow"), die("skull")],
      choiceStage: "attacker-reroll",
      teamRerollAvailable: true,
    });
    const point = await enumerateDecision(game, null);
    const { index } = await plannerCoach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    });
    expect(
      fixtureValue(fixtureValue(point.candidates[index]).commands[0]).type
    ).toBe("team-reroll-block");
  });
});
const carrierGame = (carrierAt: { x: number; y: number }) =>
  new HeadlessGame({
    scenario: {
      id: "planner-carrier-hit",
      name: "Planner carrier hit",
      description: "",
      setup: {
        team1Placements: [
          {
            playerIndex: 0,
            x: carrierAt.x - 3,
            y: carrierAt.y,
            stats: { ST: 3 },
          },
          {
            playerIndex: 1,
            x: carrierAt.x - 2,
            y: carrierAt.y + 2,
            stats: { ST: 3 },
          },
        ],
        team2Placements: [
          {
            playerIndex: 0,
            x: carrierAt.x,
            y: carrierAt.y,
            stats: { ST: 3 },
            hasBall: true,
          },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
      },
    },
    seed: 1,
  });



describe("the planner's hit on their carrier", () => {

  it("walks the helper to a square that assists, past one that does not", async () => {
    const game = new HeadlessGame({
      scenario: {
        id: "planner-assist-square",
        name: "Planner assist square",
        description: "",
        setup: {
          team1Placements: [
            { playerIndex: 0, x: 7, y: 7, stats: { ST: 3 } },
            { playerIndex: 1, x: 7, y: 3, stats: { MA: 6, ST: 3 } },
          ],
          team2Placements: [
            { playerIndex: 0, x: 10, y: 5, stats: { ST: 3 }, hasBall: true },

            { playerIndex: 1, x: 10, y: 3, stats: { ST: 3 } },
          ],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        },
      },
      seed: 1,
    });
    const rng = createCoachRng(1);
    for (let i = 0; i < 30; i++) {
      const point = await enumerateDecision(game, null);
      const { index } = await plannerCoach.choose({
        game,
        snapshot: game.snapshot(),
        point,
        rng,
      });
      const commands = fixtureValue(point.candidates[index]).commands;
      for (const command of commands) {
        const response = await game.execute(command);
        expect(response.ok).toBe(true);
        if (command.type !== "block") continue;
        expect(response.pendingDecision).toMatchObject({ type: "block-dice" });
        const dice = fixtureValue(response.pendingDecision);
        if (dice.type !== "block-dice") throw new Error("Expected block dice");
        expect(dice.options).toHaveLength(2);
        return;
      }
    }
    throw new Error("the planner never blocked the carrier");
  });

  it("brings the assist up first, so the blitz throws two dice", async () => {
    const game = carrierGame({ x: 10, y: 5 });
    const rng = createCoachRng(1);
    const helper = game.ctx.teams[0].players[1];
    for (let i = 0; i < 20; i++) {
      const point = await enumerateDecision(game, null);
      const { index } = await plannerCoach.choose({
        game,
        snapshot: game.snapshot(),
        point,
        rng,
      });
      const commands = fixtureValue(point.candidates[index]).commands;
      for (const command of commands) {
        const response = await game.execute(command);
        expect(response.ok).toBe(true);
        if (command.type !== "block") continue;
        expect(command.attackerId).toBe(
          fixtureValue(game.ctx.teams[0].players[0]).id
        );
        expect(fixtureValue(helper).gridPosition?.x).toBe(9);
        expect(response.pendingDecision).toMatchObject({ type: "block-dice" });
        const dice = fixtureValue(response.pendingDecision);
        if (dice.type !== "block-dice") throw new Error("Expected block dice");
        expect(dice.options).toHaveLength(2);
        return;
      }
    }
    throw new Error("the planner never blocked the carrier");
  });
});
