import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type PlayerPlacement, type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { type ActionType } from "../../src/types/events";
import { SkillType } from "../../src/types/Skills";
import { nativeFixtures } from "../../src/testing/fixtures/rosterFixtures";
import { forceDice } from "../utils/test-helpers";

function scenario(opts: {
  turn?: number;
  carrier?: Partial<PlayerPlacement>;
  team1Roster?: RosterName;
  team2Placements?: PlayerPlacement[];
}): Scenario {
  return {
    id: "stalling",
    name: "Stalling",
    description: "",
    setup: {
      ...(opts.team1Roster !== undefined && { team1Roster: opts.team1Roster }),
      team1Placements: [
        { playerIndex: 0, x: 15, y: 5, hasBall: true, ...opts.carrier },
        { playerIndex: 1, x: 14, y: 5 },

        { playerIndex: 2, x: 2, y: 9 },
      ],
      team2Placements: opts.team2Placements ?? [{ playerIndex: 0, x: 2, y: 1 }],
      activeTeam: "team1",
      turn: opts.turn ?? 1,
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  };
}

const crowdRolls = (events: { name: string; data?: unknown }[]): string[] =>
  events
    .filter((e) => e.name === "diceRoll")
    .map((e) => z.object({ description: z.string() }).parse(e.data).description)
    .filter((d) => d.startsWith("Crowd Takes Action"));

async function declareAndEnd(game: HeadlessGame, action: ActionType) {
  const id = fixtureValue(game.ctx.teams[0].players[0]).id;
  const declared = await game.execute({
    type: "declare-action",
    playerId: id,
    action,
  });
  expect(declared.ok).toBe(true);
  return game.execute({ type: "end-activation", playerId: id });
}

describe("Stalling: the Crowd Takes Action", () => {
  for (const saved of [true, false]) {
    const outcome = saved ? "prevents" : "fails to prevent";
    it(`native Steady Footing ${outcome} the crowd knockdown and Turnover`, async () => {
      const slot = fixtureValue(
        nativeFixtures(SkillType.STEADY_FOOTING).find(
          (slot) => slot.positionName === "Grail Knight"
        )
      );
      const game = new HeadlessGame({
        seed: 1,
        scenario: scenario({
          turn: 1,
          team1Roster: slot.roster,
          carrier: { playerIndex: slot.playerIndex },
        }),
      });
      const carrier = game.ctx.teams[0].players[slot.playerIndex];

      if (saved) forceDice(game.ctx.rng, [4, 6]);
      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(carrier).id,
        action: "move",
      });
      const response = await game.execute({
        type: "end-activation",
        playerId: fixtureValue(carrier).id,
      });

      expect(crowdRolls(response.events)).toHaveLength(1);
      const expectedData: unknown = expect.objectContaining({
        description: `Steady Footing (${fixtureValue(carrier).playerName}): ${String(saved ? 6 : 1)}, needs 6+`,
      });
      expect(response.events).toContainEqual(
        expect.objectContaining({
          name: "diceRoll",
          data: expectedData,
        })
      );
      if (!saved) {
        expect(fixtureValue(carrier).status).not.toBe(PlayerStatus.ACTIVE);
        expect(response.snapshot.activeTeamId).toBe(game.ctx.teams[1].id);
        return;
      }
      expect(fixtureValue(carrier).status).toBe(PlayerStatus.ACTIVE);
      expect(response.snapshot.activeTeamId).toBe(game.ctx.teams[0].id);
      expect(response.snapshot.ballPosition).toEqual({ x: 15, y: 5 });
      expect(
        response.events.some(
          (e) => e.name === "turnover" || e.name === "playerKnockedDown"
        )
      ).toBe(false);
      expect(
        game.ctx.gameService.hasPlayerActed(fixtureValue(carrier).id)
      ).toBe(true);
    });
  }

  it("on Turn 1 the crowd always hits: Knocked Down and a Turnover", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const carrier = game.ctx.teams[0].players[0];
    const response = await declareAndEnd(game, "move");

    expect(crowdRolls(response.events)).toHaveLength(1);
    expect(fixtureValue(carrier).status).not.toBe(PlayerStatus.ACTIVE);
    expect(response.snapshot.activeTeamId).toBe(game.ctx.teams[1].id);
    expect(response.snapshot.stallingPlayerIds).toEqual([
      fixtureValue(carrier).id,
    ]);
  });

  it("on Turn 6 only a 6 hits; otherwise the player stays up, still Stalling", async () => {
    let missed = 0;
    let hit = 0;
    for (let seed = 1; seed <= 40 && (missed < 2 || hit < 1); seed++) {
      const game = new HeadlessGame({ scenario: scenario({ turn: 6 }), seed });
      const carrier = game.ctx.teams[0].players[0];
      const response = await declareAndEnd(game, "move");
      const [roll] = crowdRolls(response.events);
      expect(roll, `seed ${String(seed)}`).toMatch(
        /^Crowd Takes Action \(Human Lineman #1\): [1-6]$/
      );
      expect(response.snapshot.stallingPlayerIds).toEqual([
        fixtureValue(carrier).id,
      ]);
      if (fixtureValue(roll).endsWith(": 6")) {
        hit++;
        expect(fixtureValue(carrier).status).toBe(PlayerStatus.PRONE);
        expect(response.snapshot.activeTeamId).toBe(game.ctx.teams[1].id);
      } else {
        missed++;
        expect(fixtureValue(carrier).status).toBe(PlayerStatus.ACTIVE);
        expect(game.ctx.gameService.getState().balls[0].at).toEqual({
          x: 15,
          y: 5,
        });
        expect(response.snapshot.activeTeamId).toBe(game.ctx.teams[0].id);
      }
    }
    expect(missed).toBeGreaterThanOrEqual(2);
    expect(hit).toBe(1);
  });

  it("rolls when the player Forgoes their activation", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const carrier = game.ctx.teams[0].players[0];
    const response = await game.execute({
      type: "end-activation",
      playerId: fixtureValue(carrier).id,
    });
    expect(crowdRolls(response.events)).toHaveLength(1);
    expect(response.snapshot.stallingPlayerIds).toEqual([
      fixtureValue(carrier).id,
    ]);
  });

  it("does not roll when the turn ends before the player is activated", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const response = await game.execute({ type: "end-turn" });
    expect(crowdRolls(response.events)).toEqual([]);
    expect(response.snapshot.stallingPlayerIds).toBeUndefined();
  });

  it("is not Stalling when scoring would need a Dodge", async () => {
    const game = new HeadlessGame({
      scenario: scenario({
        team2Placements: [{ playerIndex: 0, x: 16, y: 6 }],
      }),
      seed: 1,
    });
    const response = await declareAndEnd(game, "move");
    expect(crowdRolls(response.events)).toEqual([]);
    expect(response.snapshot.stallingPlayerIds).toBeUndefined();
  });

  it("is not Stalling when scoring would need a Rush", async () => {
    const game = new HeadlessGame({
      scenario: scenario({ carrier: { x: 12, y: 5 } }),
      seed: 1,
    });

    const response = await declareAndEnd(game, "move");
    expect(crowdRolls(response.events)).toEqual([]);
  });

  it("is not Stalling for a player who must roll when activated", async () => {
    const game = new HeadlessGame({
      scenario: scenario({
        team1Roster: RosterName.GOBLIN,
        carrier: { x: 16, y: 5 },
      }),
      seed: 1,
    });
    const troll = game.ctx.teams[0].players[0];
    const response = await game.execute({
      type: "end-activation",
      playerId: fixtureValue(troll).id,
    });
    expect(crowdRolls(response.events)).toEqual([]);
  });

  it("is not Stalling after a Hand-off gets rid of the ball", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const [carrier, mate] = game.ctx.teams[0].players;
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(carrier).id,
      action: "handoff",
    });
    const response = await game.execute({
      type: "handoff",
      playerId: fixtureValue(carrier).id,
      targetId: fixtureValue(mate).id,
    });
    expect(crowdRolls(response.events)).toEqual([]);
    expect(response.snapshot.stallingPlayerIds).toBeUndefined();
  });

  it("is Stalling when a Pass Action ends still holding the ball", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const response = await declareAndEnd(game, "pass");
    expect(crowdRolls(response.events)).toHaveLength(1);
  });

  it("is Stalling after putting the ball down with Fumblerooski (FAQ)", async () => {
    const game = new HeadlessGame({
      scenario: scenario({ team1Roster: RosterName.ELVEN_UNION }),
      seed: 1,
    });
    const carrier = game.ctx.teams[0].players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(carrier).id,
      action: "move",
    });
    await game.execute({
      type: "move",
      playerId: fixtureValue(carrier).id,
      path: [{ x: 15, y: 4 }],
    });
    const dropped = await game.execute({
      type: "fumblerooski",
      playerId: fixtureValue(carrier).id,
      x: 15,
      y: 5,
    });
    expect(dropped.ok).toBe(true);
    const response = await game.execute({
      type: "end-activation",
      playerId: fixtureValue(carrier).id,
    });
    expect(crowdRolls(response.events)).toHaveLength(1);
    expect(response.snapshot.stallingPlayerIds).toEqual([
      fixtureValue(carrier).id,
    ]);
  });

  it("is not Stalling once the player scores", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const carrier = game.ctx.teams[0].players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(carrier).id,
      action: "move",
    });
    const response = await game.execute({
      type: "move",
      playerId: fixtureValue(carrier).id,
      path: [16, 17, 18, 19].map((x) => ({ x, y: 5 })),
    });
    expect(response.snapshot.score[game.ctx.teams[0].id]).toBe(1);
    expect(crowdRolls(response.events)).toEqual([]);
  });

  it("rolls when a stalling player's turn is ended mid-activation", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const carrier = game.ctx.teams[0].players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(carrier).id,
      action: "move",
    });
    await game.execute({
      type: "move",
      playerId: fixtureValue(carrier).id,
      path: [{ x: 15, y: 4 }],
    });
    const response = await game.execute({ type: "end-turn" });
    expect(crowdRolls(response.events)).toHaveLength(1);
    expect(response.snapshot.stallingPlayerIds).toEqual([
      fixtureValue(carrier).id,
    ]);
  });
});
