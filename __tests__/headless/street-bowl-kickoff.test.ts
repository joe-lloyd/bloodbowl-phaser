import { describe, expect, it } from "vitest";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { KICKOFF_TABLES } from "../../src/game/kickoff/kickoffTables";
import {
  STREET,
  STREET_SETUP,
  playerOf,
  squaresOf,
  statusesOf,
  variantKick,
} from "./variantKickoffs";

const kick = (dice: number[], extra: Partial<Parameters<typeof variantKick>[0]> = {}) =>
  variantKick({ format: STREET, setup: STREET_SETUP, dice, ...extra });

describe("Street Bowl kick-off table", () => {
  it("maps 2D6 to the Street Bowl events", () => {
    expect(Object.values(KICKOFF_TABLES["street-bowl"])).toEqual([
      "Loose Masonry",
      "Riot",
      "Stray Pony",
      "High Kick",
      "Cheering Fans",
      "Brilliant Coaching",
      "Changing Weather",
      "Potion Peddler",
      "Blitz!",
      "Throw a Bomb",
      "Guards!",
    ]);
  });

  it("SB-K2 Loose Masonry knocks down the random Wide Zone with an unmodified Armour roll", async () => {
    const { game, result } = await kick([1, 1, 1, 6, 6, 1, 1, 1, 1]);

    expect(result.event).toBe(KickoffEvent.LOOSE_MASONRY);
    expect(statusesOf(game, "team1")).toEqual(["Active", "Active", "Active", "Stunned", "Active", "Active", "Active"]);
    expect(statusesOf(game, "team2")).toEqual(["Active", "Active", "Active", "Prone", "Active", "Active", "Active"]);
  });

  it("SB-K3 Riot Stuns D3 random players of the lower roll", async () => {
    const { game, result } = await kick([1, 2, 2, 5, 4, 1, 1]);

    expect(result.event).toBe(KickoffEvent.RIOT);
    expect(statusesOf(game, "team1")).toEqual(["Stunned", "Stunned", "Active", "Active", "Active", "Active", "Active"]);
    expect(statusesOf(game, "team2")).not.toContain("Stunned");
  });

  it("SB-K4 Stray Pony drives the Lines of Scrimmage back, tramples a failed Dodge and goes round ST 5", async () => {
    const setup = {
      ...STREET_SETUP,
      team1: STREET_SETUP.team1.map((p) => (p.playerIndex === 5 ? { ...p, x: 11, y: 3 } : p)),
      team2: STREET_SETUP.team2.map((p) => (p.playerIndex === 0 ? { ...p, stats: { ST: 5 } } : p)),
    };
    const { game, result } = await variantKick({ format: STREET, setup, dice: [1, 3, 3, 1, 1, 1, 6, 6, 6] });

    expect(result.event).toBe(KickoffEvent.STRAY_PONY);
    expect(squaresOf(game, "team1")).toEqual(["11,2", "11,3", "11,4", "10,1", "10,5", "10,3", "8,2"]);
    expect(statusesOf(game, "team1")).toEqual(["Active", "Prone", "Active", "Active", "Active", "Active", "Active"]);
    expect(squaresOf(game, "team2")).toEqual(["14,2", "14,3", "14,4", "15,1", "15,5", "17,3", "17,2"]);
    expect(result.outcome.perTeam["team2"]).toContain(`the pony goes round ${playerOf(game, "team2", 0).playerName}`);
  });

  it("SB-K5 High Kick offers the receiving coach the landing square", async () => {
    const { response, result } = await kick([2, 3]);

    expect(result.event).toBe(KickoffEvent.HIGH_KICK);
    expect(response.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.HIGH_KICK,
      chooserTeamId: "team2",
      landingSquare: { x: 20, y: 3 },
    });
  });

  it.each([
    ["SB-K6", KickoffEvent.CHEERING_FANS, [3, 3]],
    ["SB-K7", KickoffEvent.BRILLIANT_COACHING, [3, 4]],
  ] as const)("%s %s gives the higher D6 + Fan Factor a re-roll and a tie nothing", async (_id, event, table) => {
    const won = await kick([...table, 5, 2]);
    const tied = await kick([...table, 4, 4]);

    expect(won.result.event).toBe(event);
    expect(won.game.snapshot().driveEffects?.freeRerolls).toEqual({ team1: 1 });
    expect(tied.game.snapshot().driveEffects?.freeRerolls ?? {}).toEqual({});
  });

  it("SB-K8 Changing Weather rolls Street Bowl weather and scatters three times on Normal", async () => {
    const normal = await kick([4, 4, 3, 4, 7, 7, 7]);
    const smog = await kick([4, 4, 1, 1]);

    expect(normal.game.snapshot().weather).toBe("Normal");
    expect(normal.response.events.find((event) => event.name === GameEventNames.BallScattered)?.data).toMatchObject({
      from: { x: 20, y: 3 },
      to: { x: 20, y: 6 },
    });
    expect(smog.game.snapshot().weather).toBe("Smog");
    expect(smog.response.events.some((event) => event.name === GameEventNames.BallScattered)).toBe(false);
  });

  it("SB-K9 Potion Peddler gives each team a Magic Potion", async () => {
    const { result } = await kick([4, 5]);

    expect(result.outcome.perTeam).toEqual({
      team1: ["gains a free Magic Potion"],
      team2: ["gains a free Magic Potion"],
    });
  });

  it("SB-K10 Blitz! opens a D3+1 kicking-team step with no Kick Team-mate", async () => {
    const { response, result } = await kick([5, 5, 4]);

    expect(result.event).toBe(KickoffEvent.BLITZ);
    expect(response.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.BLITZ,
      chooserTeamId: "team1",
      selectionLimit: 3,
    });
  });

  it("SB-K11 Throw a Bomb blows up a random player of the lower team", async () => {
    const { game, result } = await kick([5, 6, 1, 6, 1, 1, 1, 1, 1, 1]);

    expect(result.event).toBe(KickoffEvent.THROW_A_BOMB);
    expect(statusesOf(game, "team1")).toEqual(["Prone", "Active", "Active", "Active", "Active", "Active", "Active"]);
    expect(statusesOf(game, "team2")).not.toContain("Prone");
  });

  it("SB-K11 Throw a Bomb is a dud on a tie", async () => {
    const { game, result } = await kick([5, 6, 3, 3]);

    expect(result.outcome.perTeam["team1"]).toEqual(["the bomb is a dud"]);
    expect([...statusesOf(game, "team1"), ...statusesOf(game, "team2")]).not.toContain("Prone");
  });

  it("SB-K12 Guards! arrests a slowest player Knocked Down and shoves another towards its End Zone", async () => {
    const slow = { MA: 3, ST: 3 };
    const setup = {
      ...STREET_SETUP,
      team1: STREET_SETUP.team1.map((p) => (p.playerIndex === 4 ? { ...p, stats: slow } : p)),
      team2: STREET_SETUP.team2.map((p) => (p.playerIndex === 4 ? { ...p, stats: slow } : p)),
    };
    const { game, result } = await variantKick({ format: STREET, setup, dice: [6, 6, 5, 3] });

    expect(result.event).toBe(KickoffEvent.GUARDS);
    expect(playerOf(game, "team1", 4).status).toBe("Removed");
    expect(playerOf(game, "team1", 4).gridPosition).toBeUndefined();
    expect(playerOf(game, "team2", 4).gridPosition).toEqual({ x: 16, y: 5 });
  });
});
