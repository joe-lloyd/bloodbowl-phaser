import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { MatchSave } from "../../src/headless/serialization";
import type { MatchRecording } from "../../src/simulation/runMatch";
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

/** Team 1 scores at x = 19. Turn 6 is the last turn of the half. */
function game(setup: Partial<ScenarioSetup>, seed = 1) {
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
  const command = point.candidates[choice.index].commands[0];
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

const goblin = (
  x: number,
  y: number,
  MA: number,
  hasBall = true
): PlayerPlacement => ({
  playerIndex: 1,
  x,
  y,
  hasBall,
  skills: [SkillType.RIGHT_STUFF, SkillType.DODGE],
  stats: { MA, ST: 2, AG: 3, PA: 4, AV: 8 },
});

describe("Throw Team-mate plans", () => {
  it("throws a slow carrier on the last turn when it cannot run in", async () => {
    const subject = game({
      team1Placements: [troll(13, 5), goblin(14, 5, 2)],
    });
    const coach = createPlannerCoach();
    const [troller, gob] = subject.ctx.team1.players;

    const declare = await step(subject, coach);
    expect(declare.command).toEqual({
      type: "declare-action",
      playerId: troller.id,
      action: "throwTeamMate",
    });
    expect(declare.note).toBe(
      "throws the ball carrier (Throw Team-mate: 4+, Landing: 3+)"
    );

    const thrown = await step(subject, coach);
    expect(thrown.command).toMatchObject({
      type: "throw-teammate",
      throwerId: troller.id,
      teammateId: gob.id,
    });
  });

  it("runs a thrown carrier in after it lands short of the end zone", async () => {
    // The throw scatters short; the goblin has not acted, so it runs in.
    const THROWN_SHORT_SEED = 3;
    const subject = game(
      { team1Placements: [troll(13, 5), goblin(14, 5, 2)] },
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
    // A fumbled throw bounces and may still land; a fumbled kick removes
    // and injures the carrier, and the turn is over.
    const launchValue = async (skill: SkillType) => {
      const subject = game({
        team1Placements: [
          {
            ...troll(15, 5),
            skills: [skill],
            stats: { MA: 4, ST: 5, AG: 5, PA: 5, AV: 10 },
          },
          goblin(14, 5, 2),
        ],
      });
      const point = await enumerateDecision(subject, null);
      const plans = activations(
        readBoard(subject, "team1"),
        DEFAULT_WEIGHTS,
        availableActions(point.candidates)
      ).filter((a) => a.action === "throwTeamMate");
      return plans[0]?.value ?? -Infinity;
    };
    const thrown = await launchValue(SkillType.THROW_TEAM_MATE);
    const kicked = await launchValue(SkillType.KICK_TEAM_MATE);

    expect(thrown).toBeGreaterThan(0);
    expect(kicked).toBeLessThan(thrown);
  });

  it("runs a carrier in rather than throwing it when the run is safe", async () => {
    const subject = game({
      team1Placements: [troll(13, 5), goblin(14, 5, 6)],
    });
    const coach = createPlannerCoach();
    const gob = subject.ctx.team1.players[1];

    expect((await step(subject, coach)).command).toEqual({
      type: "declare-action",
      playerId: gob.id,
      action: "move",
    });
  });

  it("does not throw a team-mate who has nothing to land for", async () => {
    const subject = game({
      turn: 2,
      team1Placements: [
        troll(10, 5),
        goblin(9, 5, 6, false),
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
    expect(point.candidates[choice.index].commands[0]).not.toMatchObject({
      action: "throwTeamMate",
    });
  });

  /** The goblin has acted ten squares out; the troll declares next. */
  async function trollAfterGoblin(turn: number) {
    // Too far for the goblin to run in next turn on its own, close enough
    // for a throw and a run.
    const subject = game({
      turn,
      team1Placements: [troll(6, 2), goblin(9, 5, 6)],
      team2Placements: [
        { playerIndex: 0, x: 13, y: 4 },
        { playerIndex: 1, x: 13, y: 6 },
      ],
    });
    const coach = createPlannerCoach();
    const [troller, gob] = subject.ctx.team1.players;
    await subject.execute({
      type: "declare-action",
      playerId: gob.id,
      action: "move",
    });
    await subject.execute({ type: "end-activation", playerId: gob.id });
    const declare = await step(subject, coach);
    const acting = () =>
      subject.ctx.gameService.getState().activePlayer?.id === troller.id;
    for (let i = 0; i < 12 && acting(); i++) await step(subject, coach);
    expect(acting()).toBe(false);
    return { declare, troller };
  }

  it("walks the thrower beside the goblin on turn five, for a last-turn throw", async () => {
    const { declare, troller } = await trollAfterGoblin(5);

    expect(declare.command).toEqual({
      type: "declare-action",
      playerId: troller.id,
      action: "move",
    });
    expect(declare.note).toBe("moves to throw");
    const at = troller.gridPosition!;
    expect(Math.max(Math.abs(at.x - 9), Math.abs(at.y - 5))).toBe(1);
  });

  it("does not set up a throw earlier in the half, when the throw does not pay", async () => {
    const { declare } = await trollAfterGoblin(3);

    expect(declare.note).not.toBe("moves to throw");
  });
});

describe("Throw Team-mate from a recorded match", () => {
  it("does not throw the carrier when a fumble is likelier than a score", async () => {
    // Policy-lab pilot: a Trained Troll, PA 5+ and Always Hungry, beside a
    // Goblin carrier nine squares out on turn 3. The throw needs a 6+.
    const trace = JSON.parse(
      gunzipSync(
        readFileSync(
          join(
            __dirname,
            "../fixtures/policy-lab/fumbled-carrier-throw.json.gz"
          )
        )
      ).toString()
    ) as { initial: MatchSave; recording: MatchRecording };
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

    expect(trace.recording.steps[THROW_STEP].command).toMatchObject({
      action: "throwTeamMate",
    });
    expect(point.candidates[choice.index].commands[0]).not.toMatchObject({
      action: "throwTeamMate",
    });
  });
});
