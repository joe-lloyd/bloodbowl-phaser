import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { FormationManager } from "../../src/game/managers/FormationManager";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  deserializeGameState,
  serializeGameState,
} from "../../src/headless/serialization";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

async function begin(game: HeadlessGame) {
  const response = await game.execute({
    type: "start-setup",
    kickingTeamId: game.ctx.teams[0].id,
  });
  expect(response.ok).toBe(true);
}

function preset(isTeam1: boolean) {
  return fixtureValue(
    new FormationManager()
      .getBuiltInFormations(isTeam1)
      .find((formation) => formation.name === "Balanced")
  ).positions;
}

describe("Sevens setup through the headless protocol", () => {
  it("enforces kicking-team-first setup and exposes setup legal actions", async () => {
    const game = new HeadlessGame({ seed: 71 });
    await begin(game);

    const waitingPlayer = game.ctx.teams[1].players[0];
    const waiting = await game.execute({
      type: "place-player",
      playerId: fixtureValue(waitingPlayer).id,
      x: 13,
      y: 4,
    });
    expect(waiting.ok).toBe(false);
    expect(waiting.reason).toContain("currently setting up");

    const legal = await game.execute({ type: "legal-actions" });
    expect(legal.legalActions?.setup).toMatchObject({
      canApplyPreset: true,
      canConfirm: false,
      presetNames: [
        "Balanced",
        "Spread",
        "Bunker",
        "Kick: Blitz line",
        "Kick: Press",
        "Kick: Screen",
        "Receive: Wedge",
        "Receive: Full line",
        "Receive: Flank",
      ],
    });

    const applied = await game.execute({
      type: "apply-formation",
      teamId: game.ctx.teams[0].id,
      formation: preset(true),
    });
    expect(applied.ok).toBe(true);
    const confirmed = await game.execute({
      type: "confirm-setup",
      teamId: game.ctx.teams[0].id,
    });
    expect(confirmed.ok).toBe(true);
    expect(confirmed.snapshot.subPhase).toBe(SubPhase.SETUP_RECEIVING);
    expect(confirmed.snapshot.activeTeamId).toBe(game.ctx.teams[1].id);
    expect(
      fixtureValue(confirmed.snapshot.teams[0]).players.filter(
        (player) => player.position
      )
    ).toHaveLength(7);
    expect(
      fixtureValue(confirmed.snapshot.teams[0])
        .players.filter((player) => !player.position)
        .every((player) => player.status === PlayerStatus.RESERVE)
    ).toBe(true);
  });

  it("returns the exact violated placement restriction", async () => {
    const game = new HeadlessGame({ seed: 72 });
    await begin(game);
    const [first, second] = game.ctx.teams[0].players;

    const neutral = await game.execute({
      type: "place-player",
      playerId: fixtureValue(first).id,
      x: 7,
      y: 5,
    });
    expect(neutral.ok).toBe(false);
    expect(neutral.reason).toContain("between the Lines of Scrimmage");

    const firstPlaced = await game.execute({
      type: "place-player",
      playerId: fixtureValue(first).id,
      x: 5,
      y: 0,
    });
    expect(firstPlaced.ok).toBe(true);
    const wide = await game.execute({
      type: "place-player",
      playerId: fixtureValue(second).id,
      x: 5,
      y: 1,
    });
    expect(wide.ok).toBe(false);
    expect(wide.reason).toContain("one player may be set up in each Wide Zone");
  });

  it("rejects an eighth player and an under-manned Line of Scrimmage", async () => {
    const game = new HeadlessGame({ seed: 73 });
    game.ctx.teams[0].players.push({
      ...structuredClone(fixtureValue(game.ctx.teams[0].players[0])),
      id: "team1-extra-player",
      number: 8,

      status: PlayerStatus.RESERVE,
    });
    await begin(game);

    const noLine = game.ctx.teams[0].players.slice(0, 7).map((player, index) => ({
      playerId: player.id,
      x: 5 - Math.floor(index / 7),
      y: index + 2,
    }));
    const applied = await game.execute({
      type: "apply-formation",
      teamId: game.ctx.teams[0].id,
      formation: noLine,
    });
    expect(applied.ok).toBe(true);

    const eighth = await game.execute({
      type: "place-player",
      playerId: fixtureValue(game.ctx.teams[0].players[7]).id,
      x: 4,
      y: 5,
    });
    expect(eighth.ok).toBe(false);
    expect(eighth.reason).toContain("maximum of 7");

    const confirm = await game.execute({
      type: "confirm-setup",
      teamId: game.ctx.teams[0].id,
    });
    expect(confirm.ok).toBe(false);
    expect(confirm.reason).toContain("At least three players");
  });

  it("requires a three-or-fewer concession choice, then relaxes only impossible rules", async () => {
    const game = new HeadlessGame({ seed: 74 });
    for (const player of game.ctx.teams[0].players
      .slice(2)) (player.status = PlayerStatus.REMOVED);
    await begin(game);

    const before = await game.execute({ type: "legal-actions" });
    expect(before.legalActions?.setup).toMatchObject({
      canPlace: false,
      canChooseConcession: true,
    });
    const placement = await game.execute({
      type: "place-player",
      playerId: fixtureValue(game.ctx.teams[0].players[0]).id,
      x: 6,
      y: 4,
    });
    expect(placement.reason).toContain("Choose whether to concede");

    const conceded = await game.execute({
      type: "setup-concession",
      teamId: game.ctx.teams[0].id,
      concede: false,
    });
    expect(conceded.ok).toBe(true);
    const applied = await game.execute({
      type: "apply-formation",
      teamId: game.ctx.teams[0].id,
      formation: preset(true),
    });
    expect(applied.ok).toBe(true);
    const lineRule = fixtureValue(
      applied.snapshot.setup?.teams[game.ctx.teams[0].id]
    ).restrictions.find((rule) => rule.id === "line-of-scrimmage");
    expect(lineRule).toMatchObject({ satisfied: false, satisfiable: false });
    expect(
      fixtureValue(applied.snapshot.setup?.teams[game.ctx.teams[0].id]).canConfirm
    ).toBe(true);
  });

  it("gives the receivers a touchback when the kicking team has nobody on the pitch", async () => {
    const game = new HeadlessGame({ seed: 77 });
    for (const player of game.ctx.teams[0].players) (player.status = PlayerStatus.REMOVED)
    ;
    await begin(game);
    const [team1, team2] = [game.ctx.teams[0].id, game.ctx.teams[1].id];
    const conceded = await game.execute({
      type: "setup-concession",
      teamId: team1,
      concede: false,
    });
    expect(conceded.ok).toBe(true);
    const team1Confirmed = await game.execute({
      type: "confirm-setup",
      teamId: team1,
    });
    expect(team1Confirmed.ok).toBe(true);
    await game.execute({
      type: "apply-formation",
      teamId: team2,
      formation: preset(false),
    });
    const confirmed = await game.execute({
      type: "confirm-setup",
      teamId: team2,
    });
    expect(confirmed.ok).toBe(true);

    const names = confirmed.events.map((e) => e.name);
    expect(names).not.toContain("ballKicked");
    expect(names).not.toContain("kickoffResult");
    expect(confirmed.snapshot.phase).toBe(GamePhase.PLAY);
    expect(confirmed.snapshot.activeTeamId).toBe(team2);
    expect(game.ctx.gameService.isTouchbackPending()).toBe(true);

    const taker = game.ctx.teams[1].players.find((p) => p.gridPosition)!;
    const awarded = await game.execute({
      type: "touchback",
      playerId: taker.id,
    });
    expect(awarded.ok).toBe(true);
    expect(awarded.snapshot.ballPosition).toEqual(taker.gridPosition);
  });

  it("ends the match on a penalty-free pre-setup concession", async () => {
    const game = new HeadlessGame({ seed: 75 });
    for (const player of game.ctx.teams[0].players
      .slice(3)) (player.status = PlayerStatus.REMOVED);
    await begin(game);

    const response = await game.execute({
      type: "setup-concession",
      teamId: game.ctx.teams[0].id,
      concede: true,
    });
    expect(response.ok).toBe(true);
    expect(response.snapshot.phase).toBe(GamePhase.GAME_OVER);
    expect(
      response.events.some(
        (event) =>
          event.name === "setupConcessionResolved" &&
          z
            .object({ penaltyFree: z.boolean().exactOptional() })
            .parse(event.data).penaltyFree
      )
    ).toBe(true);

    expect(response.snapshot.result).toEqual({
      reason: "concession",
      concedingTeamId: game.ctx.teams[0].id,
    });
    expect(response.snapshot.score[game.ctx.teams[0].id] ?? 0).toBe(0);
    expect(response.snapshot.score[game.ctx.teams[1].id] ?? 0).toBe(0);
    expect(response.events.some((event) => event.name === "touchdown")).toBe(
      false
    );
  });

  it("serializes setup phase, placements, decisions and restriction state", async () => {
    const game = new HeadlessGame({ seed: 76 });
    await begin(game);
    await game.execute({
      type: "place-player",
      playerId: fixtureValue(game.ctx.teams[0].players[0]).id,
      x: 6,
      y: 4,
    });

    const snapshot = game.snapshot();
    expect(snapshot.setup?.currentTeamId).toBe(game.ctx.teams[0].id);
    expect(
      fixtureValue(snapshot.setup?.teams[game.ctx.teams[0].id]).placedPlayerCount
    ).toBe(1);

    const restored = deserializeGameState(snapshot);
    const roundTrip = serializeGameState(restored, [
      game.ctx.teams[0],
      game.ctx.teams[1],
    ]);
    expect(roundTrip.setup).toEqual(snapshot.setup);
  });
});
