import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { GameEventNames } from "../../src/types/events";

const BLOODLUST_FAILS_SEED = 7;

function scenario(thrallX: number, ball: { x: number; y: number }): Scenario {
  return {
    id: "bloodlust-thrall-bite",
    name: "Bloodlust fails with a Thrall Lineman nearby",
    description:
      "a Bloodlust (2+) player fails the roll and ends the activation",
    setup: {
      team1Roster: RosterName.VAMPIRE,
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          skills: [{ type: SkillType.BLOODLUST, parameter: "2+" }],
        },
        { playerIndex: 1, x: thrallX, y: 5 },

        { playerIndex: 2, x: 3, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 20, y: 2 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: ball,
    },
  };
}

const DEFAULT_BALL = { x: 1, y: 1 };

async function failBloodlustThenEnd(
  thrallX: number,
  ball = DEFAULT_BALL
) {
  const game = new HeadlessGame({
    scenario: scenario(thrallX, ball),
    seed: BLOODLUST_FAILS_SEED,
  });
  const vampire = game.ctx.teams[0].players[0];
  const thrall = game.ctx.teams[0].players[1];
  let turnovers = 0;
  game.ctx.eventBus.on(GameEventNames.Turnover, () => turnovers++);
  const declared = await game.execute({
    type: "declare-action",
    playerId: fixtureValue(vampire).id,
    action: "move",
  });

  await game.execute({ type: "use-reaction", accept: false });
  const ended = await game.execute({
    type: "end-activation",
    playerId: fixtureValue(vampire).id,
  });
  const dice = (r: typeof ended) =>
    r.events
      .filter((e) => e.name === "diceRoll")
      .map(
        (e) => z.object({ description: z.string() }).parse(e.data).description
      );
  return {
    game,
    vampire,
    thrall,
    declaredDice: dice(declared),
    ended,
    endedDice: dice(ended),
    turnovers: () => turnovers,
  };
}

describe("Bloodlust failure at the end of the activation", () => {
  it("with no Thrall Lineman adjacent: Turnover, Distracted, drops the ball", async () => {
    const r = await failBloodlustThenEnd(5, { x: 10, y: 5 });

    expect(r.declaredDice).toEqual([
      "Bloodlust (Thrall Lineman #1): 1, needs 2+",
    ]);
    expect(r.ended.pendingDecision).toBeNull();
    expect(r.turnovers()).toBe(1);
    expect(fixtureValue(r.vampire).conditions?.map((c) => c.type)).toEqual([
      PlayerCondition.DISTRACTED,
    ]);
    expect(r.game.snapshot().ballPosition).not.toEqual({ x: 10, y: 5 });
  });

  it("offers the bite of an adjacent Thrall; biting rolls Injury and avoids the Turnover", async () => {
    const r = await failBloodlustThenEnd(11);

    expect(r.ended.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: fixtureValue(r.vampire).id,
      skill: SkillType.BLOODLUST,
    });
    const bitten = await r.game.execute({ type: "use-reaction", accept: true });

    expect(
      bitten.events
        .filter((e) => e.name === "diceRoll")
        .map(
          (e) => z.object({ description: z.string() }).parse(e.data).description
        )
    ).toEqual(["Injury Roll (Thrall Lineman #2): 1 + 6 = 7"]);
    expect(fixtureValue(r.thrall).status).toBe(PlayerStatus.STUNNED);
    expect(r.turnovers()).toBe(0);
    expect(fixtureValue(r.vampire).conditions ?? []).toEqual([]);
    expect(
      r.game
        .snapshot()
        .turn.activatedPlayerIds.includes(fixtureValue(r.vampire).id)
    ).toBe(true);
  });

  it("declining every bite is a Turnover and Distracted", async () => {
    const r = await failBloodlustThenEnd(11);
    await r.game.execute({ type: "use-reaction", accept: false });

    expect(r.turnovers()).toBe(1);
    expect(fixtureValue(r.thrall).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(r.vampire).conditions?.map((c) => c.type)).toEqual([
      PlayerCondition.DISTRACTED,
    ]);
  });
});

describe("Bloodlust failure on reaching the End Zone", () => {
  it("scores no Touchdown without a bite: Turnover and the ball drops", async () => {
    const base = scenario(5, { x: 17, y: 5 });
    const setup = {
      ...base.setup,
      team1Placements: [
        { ...fixtureValue(base.setup.team1Placements[0]), x: 17 },
        ...base.setup.team1Placements.slice(1),
      ],
      team2Placements: [{ playerIndex: 0, x: 2, y: 9 }],
    };
    const game = new HeadlessGame({
      scenario: { ...base, setup },
      seed: BLOODLUST_FAILS_SEED,
    });
    const vampire = game.ctx.teams[0].players[0];
    let turnovers = 0;
    game.ctx.eventBus.on(GameEventNames.Turnover, () => turnovers++);
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(vampire).id,
      action: "move",
    });
    await game.execute({ type: "use-reaction", accept: false });
    await game.execute({
      type: "move",
      playerId: fixtureValue(vampire).id,
      path: [
        { x: 18, y: 5 },
        { x: 19, y: 5 },
      ],
    });

    expect(fixtureValue(vampire).gridPosition).toEqual({ x: 19, y: 5 });
    expect(Object.values(game.snapshot().score)).toEqual([0, 0]);
    expect(turnovers).toBe(1);
    expect(game.snapshot().ballPosition).not.toEqual({ x: 19, y: 5 });
  });
});
