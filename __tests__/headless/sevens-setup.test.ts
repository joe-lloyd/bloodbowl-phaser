import { describe, expect, it } from "vitest";
import { FormationManager } from "../../src/game/managers/FormationManager";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  deserializeGameState,
  serializeGameState,
} from "../../src/headless/serialization";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

async function begin(game: HeadlessGame, kickingTeamId = game.ctx.team1.id) {
  const response = await game.execute({
    type: "start-setup",
    kickingTeamId,
  });
  expect(response.ok).toBe(true);
}

function preset(isTeam1: boolean, name = "Balanced") {
  return new FormationManager()
    .getBuiltInFormations(isTeam1)
    .find((formation) => formation.name === name)!.positions;
}

describe("Sevens setup through the headless protocol", () => {
  it("enforces kicking-team-first setup and exposes setup legal actions", async () => {
    const game = new HeadlessGame({ seed: 71 });
    await begin(game);

    const waitingPlayer = game.ctx.team2.players[0];
    const waiting = await game.execute({
      type: "place-player",
      playerId: waitingPlayer.id,
      x: 13,
      y: 4,
    });
    expect(waiting.ok).toBe(false);
    expect(waiting.reason).toContain("currently setting up");

    const legal = await game.execute({ type: "legal-actions" });
    expect(legal.legalActions?.setup).toMatchObject({
      canApplyPreset: true,
      canConfirm: false,
      presetNames: ["Balanced", "Spread", "Bunker"],
    });

    expect(
      (
        await game.execute({
          type: "apply-formation",
          teamId: game.ctx.team1.id,
          formation: preset(true),
        })
      ).ok
    ).toBe(true);
    const confirmed = await game.execute({
      type: "confirm-setup",
      teamId: game.ctx.team1.id,
    });
    expect(confirmed.ok).toBe(true);
    expect(confirmed.snapshot.subPhase).toBe(SubPhase.SETUP_RECEIVING);
    expect(confirmed.snapshot.activeTeamId).toBe(game.ctx.team2.id);
    expect(
      confirmed.snapshot.teams[0].players.filter((player) => player.position)
    ).toHaveLength(7);
    expect(
      confirmed.snapshot.teams[0].players
        .filter((player) => !player.position)
        .every((player) => player.status === PlayerStatus.RESERVE)
    ).toBe(true);
  });

  it("returns the exact violated placement restriction", async () => {
    const game = new HeadlessGame({ seed: 72 });
    await begin(game);
    const [first, second] = game.ctx.team1.players;

    const neutral = await game.execute({
      type: "place-player",
      playerId: first.id,
      x: 7,
      y: 5,
    });
    expect(neutral.ok).toBe(false);
    expect(neutral.reason).toContain("between the Lines of Scrimmage");

    expect(
      (
        await game.execute({
          type: "place-player",
          playerId: first.id,
          x: 5,
          y: 0,
        })
      ).ok
    ).toBe(true);
    const wide = await game.execute({
      type: "place-player",
      playerId: second.id,
      x: 5,
      y: 1,
    });
    expect(wide.ok).toBe(false);
    expect(wide.reason).toContain("one player may be set up in each Wide Zone");
  });

  it("rejects an eighth player and an under-manned Line of Scrimmage", async () => {
    const game = new HeadlessGame({ seed: 73 });
    game.ctx.team1.players.push({
      ...structuredClone(game.ctx.team1.players[0]),
      id: "team1-extra-player",
      number: 8,
      gridPosition: undefined,
      status: PlayerStatus.RESERVE,
    });
    await begin(game);

    const noLine = game.ctx.team1.players.slice(0, 7).map((player, index) => ({
      playerId: player.id,
      x: 5 - Math.floor(index / 7),
      y: index + 2,
    }));
    const applied = await game.execute({
      type: "apply-formation",
      teamId: game.ctx.team1.id,
      formation: noLine,
    });
    expect(applied.ok).toBe(true);

    const eighth = await game.execute({
      type: "place-player",
      playerId: game.ctx.team1.players[7].id,
      x: 4,
      y: 5,
    });
    expect(eighth.ok).toBe(false);
    expect(eighth.reason).toContain("maximum of 7");

    const confirm = await game.execute({
      type: "confirm-setup",
      teamId: game.ctx.team1.id,
    });
    expect(confirm.ok).toBe(false);
    expect(confirm.reason).toContain("At least three players");
  });

  it("requires a three-or-fewer concession choice, then relaxes only impossible rules", async () => {
    const game = new HeadlessGame({ seed: 74 });
    game.ctx.team1.players
      .slice(2)
      .forEach((player) => (player.status = PlayerStatus.REMOVED));
    await begin(game);

    const before = await game.execute({ type: "legal-actions" });
    expect(before.legalActions?.setup).toMatchObject({
      canPlace: false,
      canChooseConcession: true,
    });
    expect(
      (
        await game.execute({
          type: "place-player",
          playerId: game.ctx.team1.players[0].id,
          x: 6,
          y: 4,
        })
      ).reason
    ).toContain("Choose whether to concede");

    expect(
      (
        await game.execute({
          type: "setup-concession",
          teamId: game.ctx.team1.id,
          concede: false,
        })
      ).ok
    ).toBe(true);
    const applied = await game.execute({
      type: "apply-formation",
      teamId: game.ctx.team1.id,
      formation: preset(true),
    });
    expect(applied.ok).toBe(true);
    const lineRule = applied.snapshot.setup?.teams[
      game.ctx.team1.id
    ].restrictions.find((rule) => rule.id === "line-of-scrimmage");
    expect(lineRule).toMatchObject({ satisfied: false, satisfiable: false });
    expect(applied.snapshot.setup?.teams[game.ctx.team1.id].canConfirm).toBe(
      true
    );
  });

  it("ends the match on a penalty-free pre-setup concession", async () => {
    const game = new HeadlessGame({ seed: 75 });
    game.ctx.team1.players
      .slice(3)
      .forEach((player) => (player.status = PlayerStatus.REMOVED));
    await begin(game);

    const response = await game.execute({
      type: "setup-concession",
      teamId: game.ctx.team1.id,
      concede: true,
    });
    expect(response.ok).toBe(true);
    expect(response.snapshot.phase).toBe(GamePhase.GAME_OVER);
    expect(
      response.events.some(
        (event) =>
          event.name === "setupConcessionResolved" &&
          (event.data as { penaltyFree?: boolean }).penaltyFree
      )
    ).toBe(true);
  });

  it("serializes setup phase, placements, decisions and restriction state", async () => {
    const game = new HeadlessGame({ seed: 76 });
    await begin(game);
    await game.execute({
      type: "place-player",
      playerId: game.ctx.team1.players[0].id,
      x: 6,
      y: 4,
    });

    const snapshot = game.snapshot();
    expect(snapshot.setup?.currentTeamId).toBe(game.ctx.team1.id);
    expect(snapshot.setup?.teams[game.ctx.team1.id].placedPlayerCount).toBe(1);

    const restored = deserializeGameState(snapshot);
    const roundTrip = serializeGameState(restored, [
      game.ctx.team1,
      game.ctx.team2,
    ]);
    expect(roundTrip.setup).toEqual(snapshot.setup);
  });
});
