import { parseMatchTrace } from "../../src/boundary/matchTrace";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type { PlayerPlacement, ScenarioSetup } from "../../src/types/Scenario";
import { enumerateDecision } from "../../src/simulation/candidates";
import {
  availableActions,
  createPlannerCoach,
} from "../../src/simulation/ai/planner";
import { activations } from "../../src/simulation/ai/activations";
import { readBoard } from "../../src/simulation/ai/board";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import { createCoachRng } from "../../src/simulation/rng";
import type { Coach } from "../../src/simulation/coach";

function game(
  setup: Pick<ScenarioSetup, "team1Placements"> & Partial<ScenarioSetup>,
  seed = 1
) {
  return new HeadlessGame({
    seed,
    scenario: {
      id: "throw-teammate-plan",
      name: "Throw Team-mate plans",
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

async function step(subject: HeadlessGame, coach: Coach) {
  const point = await enumerateDecision(subject, null);
  const choice = await coach.choose({
    game: subject,
    snapshot: subject.snapshot(),
    point,
    rng: createCoachRng(1),
  });
  const command = fixtureValue(point.candidates[choice.index]).commands[0];
  const result = await subject.execute(command);
  expect(result.ok, JSON.stringify(command)).toBe(true);
  return { command, note: choice.note };
}

const troll = (x: number, y: number): PlayerPlacement => ({
  playerIndex: 0,
  x,
  y,
  skills: [SkillType.THROW_TEAM_MATE],
  stats: { MA: 4, ST: 5, AG: 5, PA: 3, AV: 10 },
});

const goblin = ({
  x,
  y,
  MA,
  hasBall = true,
}: {
  x: number;
  y: number;
  MA: number;
  hasBall?: boolean;
}): PlayerPlacement => ({
  playerIndex: 1,
  x,
  y,
  ...(hasBall ? { hasBall: true } : {}),
  skills: [SkillType.RIGHT_STUFF, SkillType.DODGE],
  stats: { MA, ST: 2, AG: 3, PA: 4, AV: 8 },
});

describe("Throw Team-mate plans", () => {
  it("throws a slow carrier on the last turn when it cannot run in", async () => {
    const subject = game({
      team1Placements: [troll(13, 5), goblin({ x: 14, y: 5, MA: 2 })],
    });
    const coach = createPlannerCoach();
    const [troller, gob] = subject.ctx.team1.players;

    const declare = await step(subject, coach);
    expect(declare.command).toEqual({
      type: "declare-action",
      playerId: fixtureValue(troller).id,
      action: "throwTeamMate",
    });
    expect(declare.note).toBe(
      "throws the ball carrier (Throw Team-mate: 4+, Landing: 3+)"
    );

    const thrown = await step(subject, coach);
    expect(thrown.command).toMatchObject({
      type: "throw-teammate",
      throwerId: fixtureValue(troller).id,
      teammateId: fixtureValue(gob).id,
    });
  });

  it("runs a thrown carrier in after it lands short of the end zone", async () => {
    const THROWN_SHORT_SEED = 3;
    const subject = game(
      { team1Placements: [troll(13, 5), goblin({ x: 14, y: 5, MA: 2 })] },
      THROWN_SHORT_SEED
    );
    const coach = createPlannerCoach();
    const notes: string[] = [];
    while (subject.snapshot().activeTeamId === "team1" && notes.length < 12)
      notes.push((await step(subject, coach)).note ?? "");

    expect(notes.slice(0, 3)).toEqual([
      "throws the ball carrier (Throw Team-mate: 4+, Landing: 3+)",
      "throws the ball carrier (Throw Team-mate: 4+, Landing: 3+)",
      "runs in to score (Rush: 2+)",
    ]);
    expect(subject.snapshot().score).toEqual({ team1: 1, team2: 0 });
  });

  it("prices a kick below a throw, since a fumbled kick cannot land", async () => {
    const launchValue = async (skill: SkillType) => {
      const subject = game({
        team1Placements: [
          {
            ...troll(15, 5),
            skills: [skill],
            stats: { MA: 4, ST: 5, AG: 5, PA: 5, AV: 10 },
          },
          goblin({ x: 14, y: 5, MA: 2 }),
        ],
      });
      const point = await enumerateDecision(subject, null);
      const plan = activations({
        board: readBoard(subject, "team1"),
        w: DEFAULT_WEIGHTS,
        available: availableActions(point.candidates),
      }).find((a) => a.action === "throwTeamMate");
      return plan?.value ?? -Infinity;
    };
    const thrown = await launchValue(SkillType.THROW_TEAM_MATE);
    const kicked = await launchValue(SkillType.KICK_TEAM_MATE);

    expect(thrown).toBeGreaterThan(0);
    expect(kicked).toBeLessThan(thrown);
  });

  it("runs a carrier in rather than throwing it when the run is safe", async () => {
    const subject = game({
      team1Placements: [troll(13, 5), goblin({ x: 14, y: 5, MA: 6 })],
    });
    const coach = createPlannerCoach();
    const gob = subject.ctx.team1.players[1];

    expect((await step(subject, coach)).command).toEqual({
      type: "declare-action",
      playerId: fixtureValue(gob).id,
      action: "move",
    });
  });

  it("does not throw a team-mate who has nothing to land for", async () => {
    const subject = game({
      turn: 2,
      team1Placements: [
        troll(10, 5),
        goblin({ x: 9, y: 5, MA: 6, hasBall: false }),
        { playerIndex: 2, x: 8, y: 5, hasBall: true },
      ],
    });
    const coach = createPlannerCoach();
    const point = await enumerateDecision(subject, null);
    const choice = await coach.choose({
      game: subject,
      snapshot: subject.snapshot(),
      point,
      rng: createCoachRng(1),
    });
    expect(
      fixtureValue(point.candidates[choice.index]).commands[0]
    ).not.toMatchObject({
      action: "throwTeamMate",
    });
  });

  async function trollAfterGoblin(turn: number) {
    const subject = game({
      turn,
      team1Placements: [troll(6, 2), goblin({ x: 9, y: 5, MA: 6 })],
      team2Placements: [
        { playerIndex: 0, x: 13, y: 4 },
        { playerIndex: 1, x: 13, y: 6 },
      ],
    });
    const coach = createPlannerCoach();
    const [troller, gob] = subject.ctx.team1.players;
    await subject.execute({
      type: "declare-action",
      playerId: fixtureValue(gob).id,
      action: "move",
    });
    await subject.execute({
      type: "end-activation",
      playerId: fixtureValue(gob).id,
    });
    const declare = await step(subject, coach);
    const acting = () =>
      subject.ctx.gameService.getState().activePlayer?.id ===
      fixtureValue(troller).id;
    for (let i = 0; i < 12 && acting(); i++) await step(subject, coach);
    expect(acting()).toBe(false);
    return { declare, troller };
  }

  it("walks the thrower beside the goblin on turn five, for a last-turn throw", async () => {
    const { declare, troller } = await trollAfterGoblin(5);

    expect(declare.command).toEqual({
      type: "declare-action",
      playerId: fixtureValue(troller).id,
      action: "move",
    });
    expect(declare.note).toBe("moves to throw");
    const at = fixtureValue(fixtureValue(troller).gridPosition);
    expect(Math.max(Math.abs(at.x - 9), Math.abs(at.y - 5))).toBe(1);
  });

  it("does not set up a throw earlier in the half, when the throw does not pay", async () => {
    const { declare } = await trollAfterGoblin(3);

    expect(declare.note).not.toBe("moves to throw");
  });
});

describe("Throw Team-mate from a recorded match", () => {
  it("does not throw the carrier when a fumble is likelier than a score", async () => {
    const trace = parseMatchTrace(
      gunzipSync(
        readFileSync(
          join(
            __dirname,
            "../fixtures/policy-lab/fumbled-carrier-throw.json.gz"
          )
        )
      ).toString()
    );
    const subject = new HeadlessGame({ matchSave: trace.initial });
    const THROW_STEP = 201;
    for (const step of trace.recording.steps.slice(0, THROW_STEP))
      await subject.execute(step.command);
    const point = await enumerateDecision(subject, null);
    const choice = await createPlannerCoach().choose({
      game: subject,
      snapshot: subject.snapshot(),
      point,
      rng: createCoachRng(1),
    });

    expect(
      fixtureValue(trace.recording.steps[THROW_STEP]).command
    ).toMatchObject({
      action: "throwTeamMate",
    });
    expect(
      fixtureValue(point.candidates[choice.index]).commands[0]
    ).not.toMatchObject({
      action: "throwTeamMate",
    });
  });
});
