import { describe, expect, it } from "vitest";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { KICKOFF_TABLES } from "../../src/game/kickoff/kickoffTables";
import {
  passModifier,
  pickUpModifier,
} from "../../src/game/kickoff/ballConditions";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import { gameSnapshotSchema } from "../../src/boundary/schemas/GameSnapshot";
import {
  BEACH,
  BEACH_SETUP,
  playerOf,
  squaresOf,
  statusesOf,
  variantKick,
} from "./variantKickoffs";

const noSidelineStaff = (game: HeadlessGame) => {
  for (const team of [game.ctx.team1, game.ctx.team2]) {
    team.cheerleaders = 0;
    team.coaches = 0;
  }
};

const kick = (dice: number[], extra: Partial<Parameters<typeof variantKick>[0]> = {}) =>
  variantKick({ format: BEACH, setup: BEACH_SETUP, dice, prepare: noSidelineStaff, ...extra });

const landingOf = (response: Awaited<ReturnType<typeof kick>>["response"]) =>
  response.events.find((event) => event.name === GameEventNames.KickoffBallLanding)?.data;

describe("Beach Bowl kick-off table", () => {
  it("maps 2D6 to the Beach Bowl events", () => {
    expect(Object.values(KICKOFF_TABLES["beach-bowl"])).toEqual([
      "High Tide",
      "Rousted",
      "Lost Ball",
      "High Kick",
      "Samba!",
      "Brilliant Coaching",
      "Changing Weather",
      "Jellyfish!?",
      "Seagull Attack",
      "Charge!",
      "Monster Wave",
    ]);
  });

  it("BB-K2 High Tide floods a Wide Zone, wades its players into Centre Field and makes a kick there a touchback", async () => {
    const { game, result } = await kick([1, 1, 1]);
    const intoTheSea = await kick([1, 1, 1], { setup: { ...BEACH_SETUP, landing: { x: 17, y: 1 } } });

    expect(result.event).toBe(KickoffEvent.HIGH_TIDE);
    expect(game.snapshot().driveEffects?.floodedZone).toBe("top");
    expect(playerOf(game, "team1", 3).gridPosition).toEqual({ x: 4, y: 2 });
    expect(playerOf(game, "team2", 3).gridPosition).toEqual({ x: 15, y: 2 });
    expect(landingOf(intoTheSea.response)).toEqual({ landingSquare: null, isTouchback: true });
  });

  it.each([
    [5, [], 5],
    [0, [], 2],
    [3, [2], 5],
    [3, [5], 3],
  ])("BB-K3 Rousted with the receivers' marker on %i and D6 %j starts their turn %i", async (marker, d6, started) => {
    const { game, result } = await kick([1, 2, ...d6, 1], { turn: marker });

    expect(result.event).toBe(KickoffEvent.ROUSTED);
    expect(game.ctx.gameService.getTurnNumber("team2")).toBe(started);
  });

  it("BB-K4 Lost Ball swaps in a conch shell or a beach ball for the rest of the game", async () => {
    const conch = await kick([1, 3, 2]);
    const beachBall = await kick([1, 3, 5]);

    expect(gameSnapshotSchema.parse(structuredClone(conch.game.snapshot())).lostBall).toBe("conch");
    expect(pickUpModifier(conch.game.ctx.gameService.getState())).toBe(-1);
    expect(beachBall.game.snapshot().lostBall).toBe("beach-ball");
    expect(pickUpModifier(beachBall.game.ctx.gameService.getState())).toBe(1);
    expect(passModifier(beachBall.game.ctx.gameService.getState(), "Short Pass")).toBe(-1);
  });

  it("BB-K5 High Kick offers the receiving coach the landing square", async () => {
    const { response } = await kick([2, 3]);

    expect(response.pendingDecision).toMatchObject({ type: "kickoff-event", event: KickoffEvent.HIGH_KICK, chooserTeamId: "team2" });
  });

  it.each([
    ["BB-K6", KickoffEvent.SAMBA, [3, 3]],
    ["BB-K7", KickoffEvent.BRILLIANT_COACHING, [3, 4]],
  ] as const)("%s %s gives the higher roll a re-roll and a tie nothing", async (_id, event, table) => {
    const won = await kick([...table, 2, 5]);
    const tied = await kick([...table, 4, 4]);

    expect(won.result.event).toBe(event);
    expect(won.game.snapshot().driveEffects?.freeRerolls).toEqual({ team2: 1 });
    expect(tied.game.snapshot().driveEffects?.freeRerolls ?? {}).toEqual({});
  });

  it("BB-K8 Changing Weather scatters one extra square on Perfect Conditions and Tropical Storm makes it a touchback", async () => {
    const perfect = await kick([4, 4, 3, 4, 7]);
    const storm = await kick([4, 4, 6, 6]);

    expect(perfect.game.snapshot().weather).toBe("Nice");
    expect(landingOf(perfect.response)).toEqual({ landingSquare: { x: 17, y: 5 }, isTouchback: false });
    expect(storm.game.snapshot().weather).toBe("Tropical Storm");
    expect(landingOf(storm.response)).toEqual({ landingSquare: null, isTouchback: true });
  });

  it("BB-K9 Jellyfish!? makes a random player of the lower roll take an Injury roll", async () => {
    const { game, result } = await kick([4, 5, 2, 5, 1, 1, 1]);

    expect(result.event).toBe(KickoffEvent.JELLYFISH);
    expect(statusesOf(game, "team1")).toEqual(["Stunned", "Active", "Active", "Active", "Active", "Active", "Active"]);
    expect(statusesOf(game, "team2")).not.toContain("Stunned");
  });

  it("BB-K10 Seagull Attack puts -1 on short passes and -2 on long ones for the drive", async () => {
    const { game, result } = await kick([4, 6]);
    const state = game.ctx.gameService.getState();

    expect(result.event).toBe(KickoffEvent.SEAGULL_ATTACK);
    expect(game.snapshot().driveEffects?.conditions).toEqual(["seagulls"]);
    expect([passModifier(state, "Quick Pass"), passModifier(state, "Long Bomb")]).toEqual([-1, -2]);
  });

  it("BB-K11 Charge! opens a D3+1 kicking-team step with one Blitz and one Throw Team-mate", async () => {
    const { game, response } = await kick([5, 6, 2]);
    await game.execute({ type: "kickoff-select-player", playerId: playerOf(game, "team1", 5).id });
    await game.execute({ type: "kickoff-confirm" });

    expect(response.pendingDecision).toMatchObject({ type: "kickoff-event", event: KickoffEvent.CHARGE, chooserTeamId: "team1", selectionLimit: 2 });
    expect(game.ctx.gameService.getState().turn).toMatchObject({ hasBlitzed: false, hasThrownTeamMate: false, hasKickedTeamMate: true });
  });

  it("BB-K12 Monster Wave washes everyone D3 squares one way and off-pitch players to the Reserves", async () => {
    const { game, result } = await kick([6, 6, 2, 6]);

    expect(result.event).toBe(KickoffEvent.MONSTER_WAVE);
    expect(squaresOf(game, "team1")).toEqual(["6,0", "6,1", "6,2", "off", "4,4", "3,1", "3,0"]);
    expect(statusesOf(game, "team1")[3]).toBe("Reserve");
    expect(squaresOf(game, "team2")).toEqual(["13,0", "13,1", "13,2", "off", "15,4", "16,1", "16,0"]);
  });
});
