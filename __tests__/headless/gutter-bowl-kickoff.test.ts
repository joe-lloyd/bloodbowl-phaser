import { describe, expect, it } from "vitest";
import { Inducement } from "../../src/types/Inducements";
import { inducementCount } from "../../src/game/inducements/inventory";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { KICKOFF_TABLES } from "../../src/game/kickoff/kickoffTables";
import {
  carrierMayPass,
  pickUpModifier,
  teamRerollBarred,
} from "../../src/game/kickoff/ballConditions";
import { knockedOutBox } from "../../src/game/kickoff/driveHazards";
import { forceDice } from "../utils/test-helpers";
import { gameSnapshotSchema } from "../../src/boundary/schemas/GameSnapshot";
import {
  GUTTER_SETUP,
  GUTTER_SEWER,
  GUTTER_STREET,
  playerOf,
  squaresOf,
  statusesOf,
  variantKick,
} from "./variantKickoffs";

const street = (dice: number[]) =>
  variantKick({ format: GUTTER_STREET, setup: GUTTER_SETUP, dice });
const sewer = (dice: number[], extra: Partial<Parameters<typeof variantKick>[0]> = {}) =>
  variantKick({ format: GUTTER_SEWER, setup: GUTTER_SETUP, dice, ...extra });

const ACTIVE = "Active";

describe("Gutter Bowl street kick-off table", () => {
  it("maps 2D6 to the street events", () => {
    expect(Object.values(KICKOFF_TABLES["gutter-street"])).toEqual([
      "Falling Roof Tiles",
      "Riot!",
      "Quick Attack",
      "Rogue Washing Line",
      "This Round Is on Us!",
      "Cheering Fans",
      "Changing Weather",
      "Loose Dogs",
      "Black Market Dealer",
      "Furious Neighbour",
      "The Guards Are Coming!",
    ]);
  });

  it("GB-KS2 Falling Roof Tiles makes an Armour roll for every player in a random Wide Zone", async () => {
    const { game } = await street([1, 1, 1, 6, 6, 1, 1, 1, 1]);

    expect(playerOf(game, "team1", 3).status).toBe("Stunned");
    expect(playerOf(game, "team2", 3).status).toBe(ACTIVE);
  });

  it("GB-KS3 Riot! Stuns every player who rolls a 6", async () => {
    const { game, result } = await street([1, 2, 6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 6]);

    expect(result.event).toBe(KickoffEvent.GUTTER_RIOT);
    expect(statusesOf(game, "team1")).toEqual(["Stunned", ACTIVE, ACTIVE, ACTIVE, ACTIVE, ACTIVE, ACTIVE]);
    expect(statusesOf(game, "team2")).toEqual([ACTIVE, ACTIVE, ACTIVE, ACTIVE, ACTIVE, ACTIVE, "Stunned"]);
  });

  it("GB-KS4 Quick Attack lets one marked kicking player Block and nothing else", async () => {
    const { game, response } = await street([1, 3]);
    const blocker = playerOf(game, "team1", 0).id;

    expect(response.pendingDecision).toMatchObject({ type: "kickoff-event", event: KickoffEvent.QUICK_ATTACK, chooserTeamId: "team1", selectionLimit: 1 });
    const selected = await game.execute({ type: "kickoff-select-player", playerId: blocker });
    expect(selected.ok).toBe(true);
    const confirmed = await game.execute({ type: "kickoff-confirm" });
    expect(confirmed.ok).toBe(true);
    const moved = await game.execute({ type: "declare-action", playerId: blocker, action: "move" });
    expect(moved.ok).toBe(false);
    const blocked = await game.execute({ type: "declare-action", playerId: blocker, action: "block" });
    expect(blocked.ok).toBe(true);
  });

  it("GB-KS5 Rogue Washing Line keeps a random player per team from acting next turn", async () => {
    const { game } = await street([1, 4, 1, 2]);
    const tangled = playerOf(game, "team2", 1);

    expect(game.snapshot().driveEffects?.playerModifiers).toEqual({
      [playerOf(game, "team1", 0).id]: { missesTurn: 3 },
      [tangled.id]: { missesTurn: 3 },
    });
    expect(game.ctx.gameService.getState().turn).toMatchObject({ teamId: "team2", turnNumber: 3 });
    expect(game.ctx.gameService.canActivate(tangled.id)).toBe(false);
    expect(game.ctx.gameService.canActivate(playerOf(game, "team2", 2).id)).toBe(true);
  });

  it("GB-KS6 This Round Is on Us! sends a KO'd player to the Reserves on a 4+", async () => {
    const { game } = await street([1, 5]);
    const state = game.ctx.gameService.getState();
    const dice = game.ctx.gameService.getDiceController();

    expect(game.snapshot().driveEffects?.conditions).toEqual(["round-on-us"]);
    forceDice(game.ctx.rng, [4, 3]);
    expect(knockedOutBox(state, dice, playerOf(game, "team1", 0))).toBe("reserves");
    expect(knockedOutBox(state, dice, playerOf(game, "team1", 1))).toBe("ko");
  });

  it("GB-KS7 Cheering Fans gives the higher D6 + Fan Factor a re-roll", async () => {
    const { game } = await street([3, 4, 5, 2]);

    expect(game.snapshot().driveEffects?.freeRerolls).toEqual({ team1: 1 });
  });

  it("GB-KS8 Changing Weather rolls street weather and scatters on A Normal Day", async () => {
    const normal = await street([4, 4, 3, 4, 7, 7, 7]);
    const smog = await street([4, 4, 1, 1]);

    expect(normal.game.snapshot().weather).toBe("A Normal Day");
    expect(normal.response.events.find((event) => event.name === GameEventNames.BallScattered)?.data).toMatchObject({ to: { x: 21, y: 10 } });
    expect(smog.game.snapshot().weather).toBe("Clouds of Smog");
  });

  it("GB-KS9 Loose Dogs bars team re-rolls on pick-ups and Blocks for the drive", async () => {
    const { game } = await street([4, 5]);
    const state = game.ctx.gameService.getState();

    expect([teamRerollBarred(state, "pickup"), teamRerollBarred(state, "block"), teamRerollBarred(state, "other")]).toEqual([true, true, false]);
  });

  it("GB-KS10 Black Market Dealer gives each team a Lesser Magic Potion", async () => {
    const { game, result } = await street([4, 6]);
    const state = game.ctx.gameService.getState();

    expect(result.outcome.perTeam).toEqual({
      team1: ["gains a free Lesser Magic Potion"],
      team2: ["gains a free Lesser Magic Potion"],
    });
    expect([
      inducementCount(state, "team1", Inducement.LESSER_MAGIC_POTION),
      inducementCount(state, "team2", Inducement.LESSER_MAGIC_POTION),
    ]).toEqual([1, 1]);
  });

  it("GB-KS11 Furious Neighbour KOs a random player of the lower team", async () => {
    const { game } = await street([5, 6, 1, 6, 1]);

    expect(playerOf(game, "team1", 0)).toMatchObject({ status: "KO" });
    expect(playerOf(game, "team1", 0).gridPosition).toBeUndefined();
    expect(statusesOf(game, "team2")).not.toContain("KO");
  });

  it("GB-KS12 The Guards Are Coming! arrests a random player on a 1-2", async () => {
    const { game } = await street([6, 6, 1, 2, 1, 5]);

    expect(playerOf(game, "team1", 0).status).toBe("Removed");
    expect(playerOf(game, "team2", 0).status).toBe(ACTIVE);
  });
});

describe("Gutter Bowl sewer kick-off table", () => {
  it("maps 2D6 to the sewer events", () => {
    expect(Object.values(KICKOFF_TABLES["gutter-sewer"])).toEqual([
      "Tentacled Terror",
      "Riot!",
      "Sudden Stink",
      "Bats!",
      "Get Ready, Lads!",
      "Cheering Fans",
      "Changing Weather",
      "Sticky Sludge",
      "Black Market Dealer",
      "'Fresh' Sewage",
      "Swarm of Rats",
    ]);
  });

  it("GB-KW2 Tentacled Terror makes a random player of the lower roll a Casualty", async () => {
    const { game } = await sewer([1, 1, 1, 6, 1]);

    expect(playerOf(game, "team1", 0).status).toBe("Injured");
    expect(playerOf(game, "team1", 0).gridPosition).toBeUndefined();
  });

  it("GB-KW3 Riot! uses the street rule", async () => {
    const { game, result } = await sewer([1, 2, ...Array.from({ length: 14 }, () => 6)]);

    expect(result.event).toBe(KickoffEvent.GUTTER_RIOT);
    expect(new Set([...statusesOf(game, "team1"), ...statusesOf(game, "team2")])).toEqual(new Set(["Stunned"]));
  });

  it("GB-KW4 Sudden Stink pushes both Lines of Scrimmage back, in a chain, but not into a pit", async () => {
    const moved: Partial<Record<number, { x: number; y: number }>> = { 4: { x: 10, y: 9 }, 5: { x: 11, y: 7 }, 6: { x: 11, y: 9 } };
    const setup = { ...GUTTER_SETUP, team1: GUTTER_SETUP.team1.map((p) => ({ ...p, ...moved[p.playerIndex] })) };
    const { game } = await sewer([1, 3], { setup });

    expect(squaresOf(game, "team1")).toEqual(["11,5", "11,7", "12,9", "10,2", "10,9", "10,7", "11,9"]);
    expect(squaresOf(game, "team2")).toEqual(["14,5", "14,7", "14,9", "14,2", "16,13", "16,7", "16,6"]);
  });

  it("GB-KW5 Bats! Stuns a random player of the lower roll", async () => {
    const { game } = await sewer([1, 4, 2, 5, 1]);

    expect(statusesOf(game, "team1")).toEqual(["Stunned", ACTIVE, ACTIVE, ACTIVE, ACTIVE, ACTIVE, ACTIVE]);
  });

  it("GB-KW6 Get Ready, Lads! lets every Open receiving player move one square", async () => {
    const { response } = await sewer([1, 5]);

    expect(response.pendingDecision).toMatchObject({ type: "kickoff-event", event: KickoffEvent.GET_READY_LADS, chooserTeamId: "team2", selectionLimit: 4 });
  });

  it("GB-KW8 Changing Weather rolls sewer weather with no scatter", async () => {
    const { game, response } = await sewer([4, 4, 3, 4]);

    expect(game.snapshot().weather).toBe("No More Disgusting Than Usual");
    expect(response.events.some((event) => event.name === GameEventNames.BallScattered)).toBe(false);
  });

  it("GB-KW9 Sticky Sludge gives +1 to pick-ups and stops the carrier passing", async () => {
    const { game } = await sewer([4, 5]);
    const state = game.ctx.gameService.getState();

    expect([pickUpModifier(state), carrierMayPass(state)]).toEqual([1, false]);
  });

  it("GB-KW11 'Fresh' Sewage lays everyone within 2 squares of a pit Prone", async () => {
    const { game } = await sewer([5, 6]);

    expect(statusesOf(game, "team1")).toEqual([ACTIVE, ACTIVE, ACTIVE, "Prone", ACTIVE, "Prone", "Prone"]);
    expect(statusesOf(game, "team2")).toEqual([ACTIVE, ACTIVE, ACTIVE, ACTIVE, "Prone", "Prone", "Prone"]);
  });

  it("keeps a sewer kick-off result and its drive effects through the snapshot schema", async () => {
    const { game } = await sewer([4, 5]);
    const parsed = gameSnapshotSchema.parse(structuredClone(game.snapshot()));

    expect(parsed.kick?.resolution?.event).toBe(KickoffEvent.STICKY_SLUDGE);
    expect(parsed.driveEffects?.conditions).toEqual(["sticky-sludge"]);
  });

  it("GB-KW12 Swarm of Rats sets the rats loose for the drive", async () => {
    const { game } = await sewer([6, 6]);

    expect(game.snapshot().driveEffects?.conditions).toEqual(["swarm-of-rats"]);
  });
});
