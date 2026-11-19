import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import {
  tacticalGame,
  coachStep,
} from "../../scripts/coach/policy-lab/fixtures";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { SkillType } from "../../src/types/Skills";

describe("late-half scoring and preservation", () => {
  it("tries a low-probability final-turn pass when carrier progress cannot score", async () => {
    const game = tacticalGame({
      team1Placements: [
        { playerIndex: 0, x: 14, y: 5, hasBall: true, stats: { MA: 1, PA: 5 } },
        { playerIndex: 1, x: 19, y: 5, stats: { MA: 1, AG: 5 } },
      ],
    });
    expect((await coachStep(game, createPlannerCoach())).command).toMatchObject(
      {
        type: "declare-action",
        action: "pass",
      }
    );
  });

  it.each([
    [2, 12, 16],
    [10, 14, 17],
  ])(
    "targets a final-turn scoring receiver instead of progress from x%i",
    async (carrier, progress, scorer) => {
      const game = tacticalGame(
        {
          team1Placements: [
            {
              playerIndex: 0,
              x: carrier,
              y: 5,
              hasBall: true,
              stats: { MA: 1, PA: 2, AG: 2 },
            },
            { playerIndex: 1, x: progress, y: 5, stats: { MA: 1, AG: 2 } },
            { playerIndex: 2, x: scorer, y: 5, stats: { MA: 1, AG: 2 } },
          ],
        },
        { opponentTurnsPlayed: 6 }
      );
      const coach = createPlannerCoach();
      let choice = await coachStep(game, coach);
      for (
        let i = 0;
        i < 12 && fixtureValue(choice.command).type !== "pass";
        i++
      )
        choice = await coachStep(game, coach);
      expect(choice.command).toMatchObject({ type: "pass", x: scorer, y: 5 });
    }
  );

  it("prefers rushing into a better handoff when that alternative can score", async () => {
    const game = tacticalGame({
      team1Placements: [
        { playerIndex: 0, x: 15, y: 5, hasBall: true, stats: { MA: 1, PA: 5 } },
        { playerIndex: 1, x: 19, y: 5, stats: { MA: 1, AG: 5 } },
      ],
    });
    expect((await coachStep(game, createPlannerCoach())).command).toMatchObject(
      {
        type: "declare-action",
        action: "handoff",
      }
    );
  });

  it("attempts a difficult final-turn scoring run rather than harmless progress", async () => {
    const game = tacticalGame({
      team1Placements: [
        { playerIndex: 0, x: 12, y: 5, hasBall: true, stats: { MA: 6, AG: 5 } },
      ],
      team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    });
    const choice = await coachStep(game, createPlannerCoach());
    expect(choice.command).toMatchObject({
      type: "declare-action",
      action: "move",
    });
    expect(choice.note).toContain("runs in to score");
  });

  it("uses turn-five rushes when six safe squares leave no turn-six scoring reach", async () => {
    const game = tacticalGame({
      turn: 5,
      team1Placements: [
        { playerIndex: 0, x: 3, y: 5, hasBall: true, stats: { MA: 6 } },
      ],
    });
    const coach = createPlannerCoach();
    await coachStep(game, coach);
    for (
      let i = 0;
      i < 12 && game.ctx.gameService.getState().activePlayer;
      i++
    ) {
      await coachStep(game, coach);
    }
    expect(fixtureValue(game.ctx.team1.players[0]).gridPosition?.x).toBe(11);
  });

  it("keeps turn-five preparation away from an equally reachable exposed sideline", async () => {
    const game = tacticalGame(
      {
        turn: 5,
        team1Placements: [
          {
            playerIndex: 0,
            x: 5,
            y: 5,
            hasBall: true,
            stats: { MA: 6, AG: 5, ST: 2, AV: 6 },
          },
        ],
        team2Placements: [
          { playerIndex: 0, x: 12, y: 0, stats: { MA: 1, ST: 5 } },
        ],
      },
      { league: true, opponentTurnsPlayed: 4 }
    );
    const coach = createPlannerCoach();
    await coachStep(game, coach);
    for (let i = 0; i < 12 && game.ctx.gameService.getState().activePlayer; i++)
      await coachStep(game, coach);
    expect(fixtureValue(game.ctx.team1.players[0]).gridPosition).toMatchObject({
      x: 11,
    });
    expect(
      fixtureValue(fixtureValue(game.ctx.team1.players[0]).gridPosition).y
    ).toBeGreaterThan(2);
    expect(
      fixtureValue(fixtureValue(game.ctx.team1.players[0]).gridPosition).y
    ).toBeLessThan(10);
  });

  it("takes the available turn-five equalizer instead of stalling while behind", async () => {
    const game = tacticalGame(
      {
        turn: 5,
        team1Placements: [
          { playerIndex: 0, x: 17, y: 5, hasBall: true, stats: { MA: 6 } },
        ],
      },
      { half2: true, score: [0, 1], opponentTurnsPlayed: 4 }
    );
    const coach = createPlannerCoach();
    const choice = await coachStep(game, coach);
    expect(choice.note).toContain("runs in to score");
    for (
      let i = 0;
      i < 8 && game.ctx.gameService.getState().score["team1"] === 0;
      i++
    ) {
      await coachStep(game, coach);
    }
    expect(game.ctx.gameService.getState().score["team1"]).toBe(1);
  });

  it("withdraws a valuable league player from unnecessary exposure when scoring is out of reach", async () => {
    const game = tacticalGame(
      {
        team1Placements: [
          {
            playerIndex: 0,
            x: 9,
            y: 5,
            stats: { ST: 2, AG: 2, AV: 6, MA: 1 },
            skills: [SkillType.DODGE],
          },
        ],
        team2Placements: [
          {
            playerIndex: 0,
            x: 10,
            y: 5,
            hasBall: true,
            stats: { ST: 5, MA: 1 },
            skills: [SkillType.MIGHTY_BLOW],
          },
        ],
      },
      { league: true, opponentTurnsPlayed: 5 }
    );
    fixtureValue(game.ctx.team1.players[0]).cost = 600_000;
    const coach = createPlannerCoach();
    expect((await coachStep(game, coach)).command).toMatchObject({
      type: "declare-action",
      action: "move",
    });
    expect((await coachStep(game, coach)).command).toMatchObject({
      type: "move",
      path: [{ x: 8 }],
    });
  });

  it("screens an unreachable late-half carrier instead of offering a stronger opponent a free hit", async () => {
    const game = tacticalGame(
      {
        team1Placements: [
          { playerIndex: 0, x: 9, y: 5, stats: { ST: 2, AG: 2, MA: 6, AV: 7 } },
        ],
        team2Placements: [
          {
            playerIndex: 0,
            x: 12,
            y: 5,
            hasBall: true,
            stats: { ST: 5, MA: 1 },
          },
        ],
      },
      { league: true, opponentTurnsPlayed: 5 }
    );
    expect((await coachStep(game, createPlannerCoach())).note).toBe(
      "moves to screen"
    );
  });

  it.each([
    [1, "block"],
    [6, "move"],
  ] as const)(
    "hits a Strength %i target or withdraws according to the actual matchup",
    async (strength, action) => {
      const game = tacticalGame(
        {
          team1Placements: [
            {
              playerIndex: 0,
              x: 9,
              y: 5,
              stats: { ST: 3, AG: 2, AV: 7, MA: 1 },
              skills: [SkillType.BLOCK, SkillType.DODGE],
            },
          ],
          team2Placements: [
            { playerIndex: 0, x: 10, y: 5, stats: { ST: strength, MA: 1 } },
            { playerIndex: 1, x: 1, y: 1, hasBall: true },
          ],
        },
        { league: true, opponentTurnsPlayed: 5 }
      );
      fixtureValue(game.ctx.team1.players[0]).cost = 600000;
      expect(
        (await coachStep(game, createPlannerCoach())).command
      ).toMatchObject({ type: "declare-action", action });
    }
  );

  it("still hits an imminent opposing scorer when the defensive risk is worthwhile", async () => {
    const game = tacticalGame(
      {
        team1Placements: [
          { playerIndex: 0, x: 3, y: 5, stats: { ST: 5, AV: 9 } },
        ],
        team2Placements: [
          {
            playerIndex: 0,
            x: 2,
            y: 5,
            hasBall: true,
            stats: { ST: 2, MA: 6 },
          },
        ],
      },
      { league: true, opponentTurnsPlayed: 5 }
    );
    expect((await coachStep(game, createPlannerCoach())).command).toMatchObject(
      {
        type: "declare-action",
        action: "block",
      }
    );
  });
});
