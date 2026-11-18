import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";
import type { PlayerPlacement, ScenarioSetup } from "../../src/types/Scenario";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import type { Weights } from "../../src/simulation/ai/weights";
import {
  GAME_PLANS,
  STANDARD_VARIETY,
} from "../../src/simulation/ai/gamePlans";
import { createCoachRng } from "../../src/simulation/rng";
import type { Coach } from "../../src/simulation/coach";
import { sequenceChance } from "../../src/simulation/ai/chance";

function game(setup: Partial<ScenarioSetup>) {
  return new HeadlessGame({
    seed: 1,
    scenario: {
      id: "turn-plan",
      name: "Complete a tactical plan",
      description: "",
      setup: {
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        activeTeam: "team1",
        turn: 6,
        teamRerolls: { team1: 0, team2: 0 },
        team2Placements: [{ playerIndex: 0, x: 1, y: 1 }],
        ...setup,
      },
    },
  });
}

async function step(subject: HeadlessGame, coach: Coach, seed = 1) {
  const point = await enumerateDecision(subject, null);
  const choice = await coach.choose({
    game: subject,
    snapshot: subject.snapshot(),
    point,
    rng: createCoachRng(seed),
  });
  const command = point.candidates[choice.index].commands[0];
  const result = await subject.execute(command);
  expect(result.ok, JSON.stringify(command)).toBe(true);
  return { command, note: choice.note };
}

describe("retained turn plans", () => {
  it("prices Pass and Catch rerolls and one shared team reroll literally", () => {
    const subject = game({
      team1Placements: [
        { playerIndex: 0, x: 15, y: 5, skills: [SkillType.PASS] },
        { playerIndex: 1, x: 19, y: 5, skills: [SkillType.CATCH] },
      ],
    });
    const [thrower, catcher] = subject.ctx.team1.players;
    const stages = [
      { player: thrower, rolls: [{ kind: "pass" as const, target: 2 }] },
      { player: catcher, rolls: [{ kind: "catch" as const, target: 2 }] },
    ];
    expect(sequenceChance(stages, false)).toBeCloseTo(1225 / 1296, 12);
    expect(sequenceChance(stages, true, () => false)).toBeCloseTo(25 / 27, 12);
    const arbiter = subject.ctx.gameService.getRerollArbiter();
    arbiter.consumeSkillReroll(thrower, SkillType.PASS);
    expect(
      sequenceChance(stages, false, (player, skill) =>
        arbiter.skillRerollAvailable(player, skill)
      )
    ).toBeCloseTo(175 / 216, 12);
  });

  it("takes a prepared receiver toward the end zone instead of back to the cage", async () => {
    const subject = game({
      turn: 1,
      team1Placements: [
        { playerIndex: 0, x: 9, y: 5, hasBall: true, stats: { MA: 1, PA: 2 } },
        { playerIndex: 1, x: 13, y: 5, stats: { MA: 6, AG: 2 } },
      ],
    });
    const coach = createPlannerCoach();
    expect((await step(subject, coach)).command).toMatchObject({
      type: "declare-action",
      playerId: "team1-player-2",
      action: "move",
    });
    expect((await step(subject, coach)).command).toMatchObject({
      type: "move",
      path: [{ x: 14 }],
    });
    for (let i = 0; i < 7; i++) {
      if (!subject.ctx.gameService.getState().activePlayer) break;
      await step(subject, coach);
    }
    expect(subject.ctx.team1.players[1].gridPosition?.x).toBe(19);
  });

  it("chooses a useful Pass and Catch scoring transfer over non-scoring progress", async () => {
    const subject = game({
      team1Placements: [
        {
          playerIndex: 0,
          x: 15,
          y: 5,
          hasBall: true,
          stats: { MA: 1, PA: 2 },
          skills: [SkillType.PASS],
        },
        {
          playerIndex: 1,
          x: 19,
          y: 5,
          stats: { MA: 1, AG: 2 },
          skills: [SkillType.CATCH],
        },
      ],
    });
    const coach = createPlannerCoach();
    expect((await step(subject, coach)).command).toMatchObject({
      type: "declare-action",
      action: "pass",
    });
    for (let i = 0; i < 16; i++) {
      if ((subject.ctx.gameService.getState().score?.team1 ?? 0) > 0) break;
      await step(subject, coach);
    }
    expect(subject.ctx.gameService.getState().score?.team1).toBe(1);
  });

  it("offers the actual throw after movement commits the Pass allowance", async () => {
    const subject = game({
      team1Placements: [
        { playerIndex: 0, x: 15, y: 5, hasBall: true, stats: { PA: 2 } },
        { playerIndex: 1, x: 19, y: 5 },
      ],
    });
    expect(
      (
        await subject.execute({
          type: "declare-action",
          playerId: "team1-player-1",
          action: "pass",
        })
      ).ok
    ).toBe(true);
    expect(
      (
        await subject.execute({
          type: "move",
          playerId: "team1-player-1",
          path: [{ x: 16, y: 5 }],
        })
      ).ok
    ).toBe(true);
    const point = await enumerateDecision(subject, null);
    const pass = point.candidates.find((candidate) => {
      const command = candidate.commands[0];
      return command.type === "pass" && command.x === 19 && command.y === 5;
    });
    expect(pass?.commands[0]).toEqual({
      type: "pass",
      playerId: "team1-player-1",
      x: 19,
      y: 5,
    });
  });

  it("runs a safe direct touchdown instead of forcing a skilled pass", async () => {
    const subject = game({
      team1Placements: [
        {
          playerIndex: 0,
          x: 17,
          y: 5,
          hasBall: true,
          stats: { MA: 6, PA: 2 },
          skills: [SkillType.PASS],
        },
        {
          playerIndex: 1,
          x: 19,
          y: 4,
          stats: { AG: 2 },
          skills: [SkillType.CATCH],
        },
      ],
    });
    expect((await step(subject, createPlannerCoach())).command).toMatchObject({
      type: "declare-action",
      playerId: "team1-player-1",
      action: "move",
    });
  });
});

/** The weights Standard plays with when it draws its flank game plan. */
const FLANK_PLAN = {
  ...DEFAULT_WEIGHTS,
  ...GAME_PLANS.find((p) => p.name === "flank")!.weights,
};

/** The carrier has acted and stayed put, pressed by the defence. */
async function pressedCarrier(
  extra: PlayerPlacement[],
  coach: Coach = createPlannerCoach({ weights: FLANK_PLAN }),
  seed = 1
) {
  const subject = game({
    turn: 3,
    team1Placements: [
      { playerIndex: 0, x: 8, y: 5, hasBall: true },
      { playerIndex: 1, x: 4, y: 7, stats: { MA: 8 } },
      ...extra,
    ],
    team2Placements: [
      { playerIndex: 0, x: 10, y: 4 },
      { playerIndex: 1, x: 10, y: 6 },
      { playerIndex: 2, x: 11, y: 5 },
      { playerIndex: 3, x: 11, y: 3 },
    ],
  });
  const carrier = subject.ctx.team1.players[0];
  await subject.execute({
    type: "declare-action",
    playerId: carrier.id,
    action: "move",
  });
  await subject.execute({ type: "end-activation", playerId: carrier.id });
  const declared: string[] = [];
  for (let i = 0; i < 40 && subject.snapshot().activeTeamId === "team1"; i++) {
    const { command, note } = await step(subject, coach, seed);
    if (command.type === "declare-action")
      declared.push(`${command.playerId}: ${note}`);
  }
  return { subject, declared };
}

describe("a roster's own weights", () => {
  // Scenario teams are both Human.
  it("plays them for that roster", async () => {
    const { subject, declared } = await pressedCarrier(
      [],
      createPlannerCoach({ rosters: { [RosterName.HUMAN]: { flank: 3 } } })
    );

    expect(declared).toEqual([
      `${subject.ctx.team1.players[1].id}: moves to flank`,
    ]);
  });

  it("leaves every other roster on the defaults", async () => {
    const { declared } = await pressedCarrier(
      [],
      createPlannerCoach({ rosters: { [RosterName.ORC]: { flank: 3 } } })
    );

    expect(declared.filter((d) => d.endsWith("moves to flank"))).toEqual([]);
  });
});

describe("flank setup, under Standard's flank game plan", () => {
  it("sends a runner wide of a pressed carrier, to the side the defence left", async () => {
    const { subject, declared } = await pressedCarrier([]);
    const runner = subject.ctx.team1.players[1];

    expect(declared).toEqual([`${runner.id}: moves to flank`]);
    expect(runner.gridPosition!.y).toBeGreaterThanOrEqual(8);
  });

  it("keeps the runner home for the best planner, which a flank costs", async () => {
    const { declared } = await pressedCarrier([], createPlannerCoach());

    expect(declared.filter((d) => d.endsWith("moves to flank"))).toEqual([]);
  });

  it("sends the runner wide when Standard draws its flank game plan", async () => {
    // Coach seed 6 draws the flank plan, the third of the five.
    const FLANK_SEED = 6;
    const { subject, declared } = await pressedCarrier(
      [],
      createPlannerCoach({ variety: STANDARD_VARIETY }),
      FLANK_SEED
    );

    expect(
      GAME_PLANS[createCoachRng(FLANK_SEED).int(GAME_PLANS.length)].name
    ).toBe("flank");
    expect(declared).toEqual([
      `${subject.ctx.team1.players[1].id}: moves to flank`,
    ]);
  });

  it("sends one runner wide, not the cage", async () => {
    const { subject, declared } = await pressedCarrier([
      { playerIndex: 2, x: 7, y: 4, stats: { MA: 7 } },
      { playerIndex: 3, x: 7, y: 6, stats: { MA: 7 } },
    ]);

    expect(declared.filter((d) => d.endsWith("moves to flank"))).toEqual([
      `${subject.ctx.team1.players[1].id}: moves to flank`,
    ]);
  });
});

describe("blocks that open the way for our carrier", () => {
  // Our carrier at (8,5) has acted, marked by one defender at (9,5). Our
  // player at (10,4) can hit that marker, or a defender at (11,3) standing
  // in the carrier's lane, three squares ahead.
  async function hitOn(coach: Coach) {
    const subject = game({
      turn: 3,
      team1Placements: [
        { playerIndex: 0, x: 8, y: 5, hasBall: true },
        { playerIndex: 1, x: 10, y: 4 },
      ],
      team2Placements: [
        { playerIndex: 0, x: 9, y: 5 },
        { playerIndex: 1, x: 11, y: 3 },
      ],
    });
    const carrier = subject.ctx.team1.players[0];
    await subject.execute({
      type: "declare-action",
      playerId: carrier.id,
      action: "move",
    });
    await subject.execute({ type: "end-activation", playerId: carrier.id });
    for (let i = 0; i < 6; i++) {
      const { command } = await step(subject, coach);
      if (command.type === "block") return command.defenderId;
    }
    return null;
  }
  const [marker, inLane] = ["team2-player-1", "team2-player-2"];
  const coach = (w: Partial<Weights>) =>
    createPlannerCoach({ weights: { ...DEFAULT_WEIGHTS, ...w } });

  it("hits the defender marking the carrier by default", async () => {
    expect(await hitOn(createPlannerCoach())).toBe(marker);
  });

  it("hits the defender in the carrier's lane when the lane is worth more", async () => {
    expect(await hitOn(coach({ lane: 60 }))).toBe(inLane);
  });

  it("goes back to the marker when freeing the carrier is worth more still", async () => {
    expect(await hitOn(coach({ lane: 60, freeCarrier: 90 }))).toBe(marker);
  });
});

describe("cage walk", () => {
  // A strength 4 carrier at (8,5) faces a wall at x=11: every square at
  // x=10 is in contact with one defender, every square at x=9 is clear.
  async function carrierEnd(
    skills: SkillType[],
    w: Partial<Weights>,
    wall: SkillType[] = []
  ) {
    const subject = game({
      turn: 2,
      team1Placements: [
        { playerIndex: 0, x: 8, y: 5, hasBall: true, skills, stats: { ST: 4 } },
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 2, skills: wall },
        { playerIndex: 1, x: 11, y: 5, skills: wall },
        { playerIndex: 2, x: 11, y: 8, skills: wall },
      ],
    });
    const coach = createPlannerCoach({ weights: { ...DEFAULT_WEIGHTS, ...w } });
    for (let i = 0; i < 6; i++) {
      const { command } = await step(subject, coach);
      if (command.type === "end-activation" || command.type === "end-turn")
        break;
    }
    return subject.ctx.team1.players[0].gridPosition!.x;
  }

  it("steps a carrier with Block up to the wall, which a one-die hit rarely downs", async () => {
    expect(await carrierEnd([SkillType.BLOCK], { cageWalk: 1 })).toBe(10);
  });

  it("stops the same carrier short when every mark costs the same", async () => {
    expect(await carrierEnd([SkillType.BLOCK], { cageWalk: 0 })).toBe(9);
  });

  it("stops a carrier with Block short of a wall that has Wrestle", async () => {
    // Wrestle puts a Block carrier down on Both Down, and the ball with it.
    expect(
      await carrierEnd([SkillType.BLOCK], { cageWalk: 1 }, [SkillType.WRESTLE])
    ).toBe(9);
  });

  it("stops a carrier without Block short even on the walk", async () => {
    expect(await carrierEnd([], { cageWalk: 1 })).toBe(9);
  });
});
