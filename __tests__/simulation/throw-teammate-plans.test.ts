import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type { PlayerPlacement, ScenarioSetup } from "../../src/types/Scenario";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
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

  it("walks the thrower beside a Right Stuff carrier to set up next turn's throw", async () => {
    // Ten squares out: too far for the goblin to run in next turn on its own,
    // close enough for a throw and a run.
    const subject = game({
      turn: 3,
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
    expect(declare.command).toEqual({
      type: "declare-action",
      playerId: troller.id,
      action: "move",
    });
    expect(declare.note).toBe("moves to throw");
    while (subject.ctx.gameService.getState().activePlayer?.id === troller.id)
      await step(subject, coach);
    const at = troller.gridPosition!;
    expect(Math.max(Math.abs(at.x - 9), Math.abs(at.y - 5))).toBe(1);
  });
});
