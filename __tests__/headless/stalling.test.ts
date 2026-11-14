/**
 * Stalling and the Crowd Takes Action (2025 rulebook p.80). A player holding
 * the ball when activated, who could score without rolling any dice and
 * finishes the activation without scoring, is Stalling. At the end of that
 * activation the coach rolls a D6: on a result equal to or higher than the
 * team's current Turn number, the crowd Knocks the player Down, a Turnover.
 * Forgoing the activation still rolls; a turn that ends before the player
 * is activated does not. A Pass or Hand-off that gets rid of the ball is not
 * Stalling, but putting the ball down with Fumblerooski is (May 2026 FAQ).
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { PlayerPlacement, Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { ActionType } from "../../src/types/events";
import { SkillType } from "../../src/types/Skills";
import { nativeFixtures } from "../../src/testing/fixtures/rosterFixtures";
import { forceDice } from "../utils/test-helpers";

/** A carrier at (15,5), four empty squares from team 1's End Zone at x = 19. */
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
      team1Roster: opts.team1Roster,
      team1Placements: [
        { playerIndex: 0, x: 15, y: 5, hasBall: true, ...opts.carrier },
        { playerIndex: 1, x: 14, y: 5 },
        // Keeps the turn going after the carrier's activation
        { playerIndex: 2, x: 2, y: 9 },
      ],
      team2Placements: opts.team2Placements ?? [
        { playerIndex: 0, x: 2, y: 1 },
      ],
      activeTeam: "team1",
      turn: opts.turn ?? 1,
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  };
}

const crowdRolls = (events: { name: string; data: unknown }[]): string[] =>
  events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description)
    .filter((d) => d.startsWith("Crowd Takes Action"));

/** Declare `action`, then end the activation without doing anything. */
async function declareAndEnd(game: HeadlessGame, action: ActionType) {
  const id = game.ctx.team1.players[0].id;
  expect(
    (await game.execute({ type: "declare-action", playerId: id, action })).ok
  ).toBe(true);
  return game.execute({ type: "end-activation", playerId: id });
}

describe("Stalling: the Crowd Takes Action", () => {
  for (const saved of [true, false]) {
    const outcome = saved ? "prevents" : "fails to prevent";
    it(`native Steady Footing ${outcome} the crowd knockdown and Turnover`, async () => {
      const slot = nativeFixtures(SkillType.STEADY_FOOTING).find(
        (slot) => slot.positionName === "Grail Knight"
      )!;
      const game = new HeadlessGame({
        seed: 1,
        scenario: scenario({
          turn: 1,
          team1Roster: slot.roster,
          carrier: { playerIndex: slot.playerIndex },
        }),
      });
      const carrier = game.ctx.team1.players[slot.playerIndex];
      // Pin a crowd hit and a successful save; seed 1's unforced save is a 1.
      if (saved) forceDice(game.ctx.rng, [4, 6]);
      await game.execute({
        type: "declare-action",
        playerId: carrier.id,
        action: "move",
      });
      const response = await game.execute({
        type: "end-activation",
        playerId: carrier.id,
      });

      expect(crowdRolls(response.events)).toHaveLength(1);
      expect(response.events).toContainEqual(
        expect.objectContaining({
          name: "diceRoll",
          data: expect.objectContaining({
            description: `Steady Footing (${carrier.playerName}): ${saved ? 6 : 1}, needs 6+`,
          }),
        })
      );
      if (!saved) {
        expect(carrier.status).not.toBe(PlayerStatus.ACTIVE);
        expect(response.snapshot.activeTeamId).toBe(game.ctx.team2.id);
        return;
      }
      expect(carrier.status).toBe(PlayerStatus.ACTIVE);
      expect(response.snapshot.activeTeamId).toBe(game.ctx.team1.id);
      expect(response.snapshot.ballPosition).toEqual({ x: 15, y: 5 });
      expect(
        response.events.some(
          (e) => e.name === "turnover" || e.name === "playerKnockedDown"
        )
      ).toBe(false);
      expect(game.ctx.gameService.hasPlayerActed(carrier.id)).toBe(true);
    });
  }

  it("on Turn 1 the crowd always hits: Knocked Down and a Turnover", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const carrier = game.ctx.team1.players[0];
    const response = await declareAndEnd(game, "move");

    expect(crowdRolls(response.events)).toHaveLength(1);
    expect(carrier.status).not.toBe(PlayerStatus.ACTIVE);
    expect(response.snapshot.activeTeamId).toBe(game.ctx.team2.id);
    expect(response.snapshot.stallingPlayerIds).toEqual([carrier.id]);
  });

  it("on Turn 6 only a 6 hits; otherwise the player stays up, still Stalling", async () => {
    let missed = 0;
    let hit = 0;
    for (let seed = 1; seed <= 40 && (missed < 2 || hit < 1); seed++) {
      const game = new HeadlessGame({ scenario: scenario({ turn: 6 }), seed });
      const carrier = game.ctx.team1.players[0];
      const response = await declareAndEnd(game, "move");
      const [roll] = crowdRolls(response.events);
      expect(roll, `seed ${seed}`).toMatch(
        /^Crowd Takes Action \(Human Lineman #1\): [1-6]$/
      );
      expect(response.snapshot.stallingPlayerIds).toEqual([carrier.id]);
      if (roll.endsWith(": 6")) {
        hit++;
        expect(carrier.status).toBe(PlayerStatus.PRONE);
        expect(response.snapshot.activeTeamId).toBe(game.ctx.team2.id);
      } else {
        missed++;
        expect(carrier.status).toBe(PlayerStatus.ACTIVE);
        expect(game.ctx.gameService.getState().ballPosition).toEqual({
          x: 15,
          y: 5,
        });
        expect(response.snapshot.activeTeamId).toBe(game.ctx.team1.id);
      }
    }
    expect(missed).toBeGreaterThanOrEqual(2);
    expect(hit).toBe(1);
  });

  it("rolls when the player Forgoes their activation", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const carrier = game.ctx.team1.players[0];
    const response = await game.execute({
      type: "end-activation",
      playerId: carrier.id,
    });
    expect(crowdRolls(response.events)).toHaveLength(1);
    expect(response.snapshot.stallingPlayerIds).toEqual([carrier.id]);
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
    // Seven squares to x = 19 with MA 6
    const response = await declareAndEnd(game, "move");
    expect(crowdRolls(response.events)).toEqual([]);
  });

  it("is not Stalling for a player who must roll when activated", async () => {
    // The Goblin team's Trained Troll is Really Stupid
    const game = new HeadlessGame({
      scenario: scenario({
        team1Roster: RosterName.GOBLIN,
        carrier: { x: 16, y: 5 },
      }),
      seed: 1,
    });
    const troll = game.ctx.team1.players[0];
    const response = await game.execute({
      type: "end-activation",
      playerId: troll.id,
    });
    expect(crowdRolls(response.events)).toEqual([]);
  });

  it("is not Stalling after a Hand-off gets rid of the ball", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const [carrier, mate] = game.ctx.team1.players;
    await game.execute({
      type: "declare-action",
      playerId: carrier.id,
      action: "handoff",
    });
    const response = await game.execute({
      type: "handoff",
      playerId: carrier.id,
      targetId: mate.id,
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
    const carrier = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: carrier.id,
      action: "move",
    });
    await game.execute({
      type: "move",
      playerId: carrier.id,
      path: [{ x: 15, y: 4 }],
    });
    const dropped = await game.execute({
      type: "fumblerooski",
      playerId: carrier.id,
      x: 15,
      y: 5,
    });
    expect(dropped.ok).toBe(true);
    const response = await game.execute({
      type: "end-activation",
      playerId: carrier.id,
    });
    expect(crowdRolls(response.events)).toHaveLength(1);
    expect(response.snapshot.stallingPlayerIds).toEqual([carrier.id]);
  });

  it("is not Stalling once the player scores", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const carrier = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: carrier.id,
      action: "move",
    });
    const response = await game.execute({
      type: "move",
      playerId: carrier.id,
      path: [16, 17, 18, 19].map((x) => ({ x, y: 5 })),
    });
    expect(response.snapshot.score[game.ctx.team1.id]).toBe(1);
    expect(crowdRolls(response.events)).toEqual([]);
  });

  it("rolls when a stalling player's turn is ended mid-activation", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const carrier = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: carrier.id,
      action: "move",
    });
    await game.execute({
      type: "move",
      playerId: carrier.id,
      path: [{ x: 15, y: 4 }],
    });
    const response = await game.execute({ type: "end-turn" });
    expect(crowdRolls(response.events)).toHaveLength(1);
    expect(response.snapshot.stallingPlayerIds).toEqual([carrier.id]);
  });
});
