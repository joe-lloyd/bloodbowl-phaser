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
import { enumerateDecision } from "../../src/simulation/candidates";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { createCoachRng } from "../../src/simulation/rng";
import { type Coach } from "../../src/simulation/coach";
import { defaultAnswer } from "../../src/network/decisionTimeouts";

const BLOODLUST_FAILS_SEED = 7;

const DEFAULT_BALL = { x: 1, y: 1 };

function scenario(ball: { x: number; y: number } = DEFAULT_BALL): Scenario {
  return {
    id: "bloodlust-bite-target",
    name: "Bloodlust fails with two Thrall Linemen in reach",
    description: "a Bloodlust (2+) player fails the roll beside two Thralls",
    setup: {
      team1Roster: RosterName.VAMPIRE,
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          skills: [{ type: SkillType.BLOODLUST, parameter: "2+" }],
        },
        { playerIndex: 1, x: 11, y: 5 },
        { playerIndex: 2, x: 10, y: 6 },

        { playerIndex: 3, x: 3, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 20, y: 2 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: ball,
    },
  };
}

async function failBloodlust(ball?: { x: number; y: number }) {
  const game = new HeadlessGame({
    scenario: scenario(ball),
    seed: BLOODLUST_FAILS_SEED,
  });
  const [vampire, first, second] = game.ctx.teams[0].players;
  let turnovers = 0;
  game.ctx.eventBus.on(GameEventNames.Turnover, () => turnovers++);
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(vampire).id,
    action: "move",
  });

  await game.execute({ type: "use-reaction", accept: false });
  return { game, vampire, first, second, turnovers: () => turnovers };
}

const injuryRolls = (r: { events: { name: string; data?: unknown }[] }) =>
  r.events
    .filter((e) => e.name === "diceRoll")
    .map((e) => z.object({ description: z.string() }).parse(e.data).description)
    .filter((d) => d.startsWith("Injury Roll"));

describe("Bloodlust with two or more Thrall Linemen in reach", () => {
  it("asks the coach to choose among all of them, not one at a time", async () => {
    const r = await failBloodlust();
    const ended = await r.game.execute({
      type: "end-activation",
      playerId: fixtureValue(r.vampire).id,
    });

    expect(ended.pendingDecision).toEqual({
      type: "bite-target",
      playerId: fixtureValue(r.vampire).id,
      chooserTeamId: fixtureValue(r.vampire).teamId,
      targetIds: [fixtureValue(r.first).id, fixtureValue(r.second).id],
    });
  });

  it("bites the Thrall the coach picks, even the last in board order", async () => {
    const r = await failBloodlust();
    await r.game.execute({
      type: "end-activation",
      playerId: fixtureValue(r.vampire).id,
    });

    const bitten = await r.game.execute({
      type: "choose-bite-target",
      playerId: fixtureValue(r.second).id,
    });

    expect(bitten.ok).toBe(true);
    expect(injuryRolls(bitten)).toEqual([
      expect.stringContaining(`(${fixtureValue(r.second).playerName})`),
    ]);
    expect(fixtureValue(r.second).status).not.toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(r.first).status).toBe(PlayerStatus.ACTIVE);
    expect(r.turnovers()).toBe(0);
    expect(fixtureValue(r.vampire).conditions ?? []).toEqual([]);
    expect(bitten.pendingDecision).toBeNull();
  });

  it("refuses a player who is not one of the offered Thralls", async () => {
    const r = await failBloodlust();
    await r.game.execute({
      type: "end-activation",
      playerId: fixtureValue(r.vampire).id,
    });
    const bystander = r.game.ctx.teams[0].players[3];

    const refused = await r.game.execute({
      type: "choose-bite-target",
      playerId: fixtureValue(bystander).id,
    });

    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe("command-failed: invalid-bite-target");
    expect(refused.pendingDecision).toMatchObject({ type: "bite-target" });
    expect(fixtureValue(bystander).status).toBe(PlayerStatus.ACTIVE);
    expect(r.turnovers()).toBe(0);
  });

  it("biting nobody is a Turnover and Distracted, as before", async () => {
    const r = await failBloodlust();
    await r.game.execute({
      type: "end-activation",
      playerId: fixtureValue(r.vampire).id,
    });

    await r.game.execute({ type: "choose-bite-target" });

    expect(r.turnovers()).toBe(1);
    expect(fixtureValue(r.first).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(r.second).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(r.vampire).conditions?.map((c) => c.type)).toEqual([
      PlayerCondition.DISTRACTED,
    ]);
  });

  it("End Turn with the bite owed asks the same choice and bites the pick", async () => {
    const r = await failBloodlust();
    const team2 = r.game.ctx.teams[1].id;

    const ended = await r.game.execute({ type: "end-turn" });
    expect(ended.pendingDecision).toMatchObject({
      type: "bite-target",
      targetIds: [fixtureValue(r.first).id, fixtureValue(r.second).id],
    });

    const bitten = await r.game.execute({
      type: "choose-bite-target",
      playerId: fixtureValue(r.second).id,
    });
    expect(injuryRolls(bitten)).toEqual([
      expect.stringContaining(`(${fixtureValue(r.second).playerName})`),
    ]);
    expect(fixtureValue(r.first).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(r.vampire).conditions ?? []).toEqual([]);
    expect(r.game.snapshot().activeTeamId).toBe(team2);
  });
});

async function pick(coach: Coach, ball?: { x: number; y: number }) {
  const r = await failBloodlust(ball);
  await r.game.execute({
    type: "end-activation",
    playerId: fixtureValue(r.vampire).id,
  });
  const picks = new Set<string | undefined>();

  for (let seed = 1; seed <= 20; seed++) {
    const point = await enumerateDecision(r.game, null);
    const { index } = await coach.choose({
      game: r.game,
      snapshot: r.game.snapshot(),
      point,
      rng: createCoachRng(seed),
    });
    const command = fixtureValue(point.candidates[index]).commands[0];
    picks.add(
      command.type === "choose-bite-target" ? command.playerId : "other"
    );
  }
  return { r, picks: [...picks] };
}

describe("the computer coach picks a bite target by rule", () => {

  for (const coach of [plannerCoach, heuristicCoach]) {
    it(`${coach.name}: always bites, the first Thrall in board order`, async () => {
      const { r, picks } = await pick(coach);
      expect(picks).toEqual([fixtureValue(r.first).id]);
    });

    it(`${coach.name}: not the Thrall holding the ball while another is in reach`, async () => {
      const { r, picks } = await pick(coach, { x: 11, y: 5 });
      expect(picks).toEqual([fixtureValue(r.second).id]);
    });
  }
});

describe("an unanswered bite choice", () => {
  it("bites nobody when the decision clock runs out, as a lone Thrall's does", async () => {
    const r = await failBloodlust();
    const ended = await r.game.execute({
      type: "end-activation",
      playerId: fixtureValue(r.vampire).id,
    });

    const answer = defaultAnswer(fixtureValue(ended.pendingDecision));
    expect(answer).toEqual({ type: "choose-bite-target" });
    await r.game.execute(fixtureValue(answer));
    expect(fixtureValue(r.first).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(r.second).status).toBe(PlayerStatus.ACTIVE);
    expect(r.turnovers()).toBe(1);
  });
});
