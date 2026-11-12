import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { GameEventNames } from "../../src/types/events";
import { enumerateDecision } from "../../src/simulation/candidates";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { createCoachRng } from "../../src/simulation/rng";
import { Coach } from "../../src/simulation/coach";
import { defaultAnswer } from "../../src/network/decisionTimeouts";

/**
 * Bloodlust (X+), 2025 rulebook p.125: "this player may bite an adjacent
 * Thrall Lineman team-mate". With two or more in reach the coach chooses
 * which: the game asks once, offering every Thrall, and bites the one
 * picked. Nothing picks for the coach (the old flow offered them one at a
 * time in board order, so the first was all the coach ever saw).
 *
 * Seed 7 rolls a natural 1 on the Bloodlust die (committed, never searched).
 */
const BLOODLUST_FAILS_SEED = 7;

/** The biter at (10,5); Thralls at (11,5) and (10,6), in that board order. */
function scenario(ball: { x: number; y: number } = { x: 1, y: 1 }): Scenario {
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
        // Someone left to activate, so the turn does not simply run out.
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
  const [vampire, first, second] = game.ctx.team1.players;
  let turnovers = 0;
  game.ctx.eventBus.on(GameEventNames.Turnover, () => turnovers++);
  await game.execute({
    type: "declare-action",
    playerId: vampire.id,
    action: "move",
  });
  // Keep the declared Move; the downgrade question is not the point here.
  await game.execute({ type: "use-reaction", accept: false });
  return { game, vampire, first, second, turnovers: () => turnovers };
}

const injuryRolls = (r: { events: { name: string; data?: unknown }[] }) =>
  r.events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description)
    .filter((d) => d.startsWith("Injury Roll"));

describe("Bloodlust with two or more Thrall Linemen in reach", () => {
  it("asks the coach to choose among all of them, not one at a time", async () => {
    const r = await failBloodlust();
    const ended = await r.game.execute({
      type: "end-activation",
      playerId: r.vampire.id,
    });

    expect(ended.pendingDecision).toEqual({
      type: "bite-target",
      playerId: r.vampire.id,
      chooserTeamId: r.vampire.teamId,
      targetIds: [r.first.id, r.second.id],
    });
  });

  it("bites the Thrall the coach picks, even the last in board order", async () => {
    const r = await failBloodlust();
    await r.game.execute({ type: "end-activation", playerId: r.vampire.id });

    const bitten = await r.game.execute({
      type: "choose-bite-target",
      playerId: r.second.id,
    });

    expect(bitten.ok).toBe(true);
    expect(injuryRolls(bitten)).toEqual([
      expect.stringContaining(`(${r.second.playerName})`),
    ]);
    expect(r.second.status).not.toBe(PlayerStatus.ACTIVE);
    expect(r.first.status).toBe(PlayerStatus.ACTIVE);
    expect(r.turnovers()).toBe(0);
    expect(r.vampire.conditions ?? []).toEqual([]);
    expect(bitten.pendingDecision).toBeNull();
  });

  it("refuses a player who is not one of the offered Thralls", async () => {
    const r = await failBloodlust();
    await r.game.execute({ type: "end-activation", playerId: r.vampire.id });
    const bystander = r.game.ctx.team1.players[3];

    const refused = await r.game.execute({
      type: "choose-bite-target",
      playerId: bystander.id,
    });

    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe("command-failed: invalid-bite-target");
    expect(refused.pendingDecision).toMatchObject({ type: "bite-target" });
    expect(bystander.status).toBe(PlayerStatus.ACTIVE);
    expect(r.turnovers()).toBe(0);
  });

  it("biting nobody is a Turnover and Distracted, as before", async () => {
    const r = await failBloodlust();
    await r.game.execute({ type: "end-activation", playerId: r.vampire.id });

    await r.game.execute({ type: "choose-bite-target" });

    expect(r.turnovers()).toBe(1);
    expect(r.first.status).toBe(PlayerStatus.ACTIVE);
    expect(r.second.status).toBe(PlayerStatus.ACTIVE);
    expect(r.vampire.conditions?.map((c) => c.type)).toEqual([
      PlayerCondition.DISTRACTED,
    ]);
  });

  it("End Turn with the bite owed asks the same choice and bites the pick", async () => {
    const r = await failBloodlust();
    const team2 = r.game.ctx.team2.id;

    const ended = await r.game.execute({ type: "end-turn" });
    expect(ended.pendingDecision).toMatchObject({
      type: "bite-target",
      targetIds: [r.first.id, r.second.id],
    });

    const bitten = await r.game.execute({
      type: "choose-bite-target",
      playerId: r.second.id,
    });
    expect(injuryRolls(bitten)).toEqual([
      expect.stringContaining(`(${r.second.playerName})`),
    ]);
    expect(r.first.status).toBe(PlayerStatus.ACTIVE);
    expect(r.vampire.conditions ?? []).toEqual([]);
    expect(r.game.snapshot().activeTeamId).toBe(team2);
  });
});

describe("the computer coach picks a bite target by rule", () => {
  async function pick(coach: Coach, ball?: { x: number; y: number }) {
    const r = await failBloodlust(ball);
    await r.game.execute({ type: "end-activation", playerId: r.vampire.id });
    const picks = new Set<string | undefined>();
    // Different noise each time: the pick must not change with it
    for (let seed = 1; seed <= 20; seed++) {
      const point = await enumerateDecision(r.game, null);
      const { index } = await coach.choose({
        game: r.game,
        snapshot: r.game.snapshot(),
        point,
        rng: createCoachRng(seed),
      });
      const command = point.candidates[index].commands[0];
      picks.add(
        command.type === "choose-bite-target" ? command.playerId : "other"
      );
    }
    return { r, picks: [...picks] };
  }

  for (const coach of [plannerCoach, heuristicCoach]) {
    it(`${coach.name}: always bites, the first Thrall in board order`, async () => {
      const { r, picks } = await pick(coach);
      expect(picks).toEqual([r.first.id]);
    });

    it(`${coach.name}: not the Thrall holding the ball while another is in reach`, async () => {
      const { r, picks } = await pick(coach, { x: 11, y: 5 });
      expect(picks).toEqual([r.second.id]);
    });
  }
});

describe("an unanswered bite choice", () => {
  it("bites nobody when the decision clock runs out, as a lone Thrall's does", async () => {
    const r = await failBloodlust();
    const ended = await r.game.execute({
      type: "end-activation",
      playerId: r.vampire.id,
    });

    const answer = defaultAnswer(ended.pendingDecision!);
    expect(answer).toEqual({ type: "choose-bite-target" });
    await r.game.execute(answer!);
    expect(r.first.status).toBe(PlayerStatus.ACTIVE);
    expect(r.second.status).toBe(PlayerStatus.ACTIVE);
    expect(r.turnovers()).toBe(1);
  });
});
