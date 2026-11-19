import { fixtureValue } from "../../src/testing/fixtureValue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stateChecksum } from "../../src/headless/checksum";
import { LockstepSession } from "../../src/network/LockstepSession";
import { NetworkedGameService } from "../../src/network/NetworkedGameService";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { type Scenario } from "../../src/types/Scenario";
import { SCENARIOS } from "../../src/data/scenarios";
import { PlayerStatus } from "../../src/types/Player";
import { forceDice } from "../utils/test-helpers";

afterEach(() => vi.restoreAllMocks());

function blitzScenario(targetX: number): Scenario {
  return {
    id: "guest-blitz-rush",
    name: "Guest blitz with a Rush",
    description: "",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: targetX, y: 5 },
        { playerIndex: 1, x: 2, y: 0 },
      ],
      team2Placements: [
        { playerIndex: 0, x: 3, y: 5 },
        { playerIndex: 1, x: 18, y: 10 },
      ],
      activeTeam: "team2",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 10 },
    },
  };
}

function twoEngines(scenario: Scenario) {
  const host = new HeadlessGame({ scenario, seed: 9 });
  const guest = new HeadlessGame({
    scenario,
    seed: 9,
    team1: structuredClone(host.ctx.team1),
    team2: structuredClone(host.ctx.team2),
  });
  const hostTeamId = host.ctx.team1.id;
  const guestTeamId = host.ctx.team2.id;
  const [hostEnd, guestEnd] = createInMemoryTransportPair();
  const hostSession = new LockstepSession({
    transport: hostEnd,
    game: host,
    selfId: "host-uid",
    myTeamId: hostTeamId,
    peerTeamId: guestTeamId,
    hostTeamId,
  });
  const guestSession = new LockstepSession({
    transport: guestEnd,
    game: guest,
    selfId: "guest-uid",
    myTeamId: guestTeamId,
    peerTeamId: hostTeamId,
    hostTeamId,
  });
  const board = new NetworkedGameService({ inner: guest.ctx.gameService, dispatch: (command) => guestSession.run(command), pendingDecision: () => guest.pendingDecision() });
  const settled = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await guestSession.whenIdle();
      await hostSession.whenIdle();
    }
  };
  return { host, guest, board, settled };
}

describe("board actions in an online match", () => {
  it("casts Fireball from a pitch square through the network facade on both engines", async () => {
    const scenario = structuredClone(
      fixtureValue(SCENARIOS.find((s) => s.id === "sports-wizard-spells"))
    );

    scenario.setup.activeTeam = "team2";
    scenario.setup.measures = { team2: fixtureValue(fixtureValue(scenario.setup.measures).team1) };
    const { host, guest, board, settled } = twoEngines(scenario);
    board.endTurn();
    await settled();
    expect(guest.pendingDecision()).toMatchObject({
      type: "inducement-choice",
      kind: "sports-wizard",
      chooserTeamId: guest.ctx.team2.id,
    });
    const target = guest.ctx.team1.players[0];
    const square = { ...fixtureValue(fixtureValue(target).gridPosition) };

    for (const game of [host, guest]) forceDice(game.ctx.rng, [6, 1, 1]);
    expect(board.answerInducementChoice({ spell: "fireball", square })).toBe(
      true
    );
    await settled();
    for (const game of [host, guest]) {
      expect(game.pendingDecision()).toBeNull();
      expect(fixtureValue(game.ctx.team1.players[0]).status).toBe(PlayerStatus.PRONE);
      expect(
        game.ctx.gameService.getState().matchInducements?.sportsWizards
      ).toEqual([]);
      expect(game.ctx.gameService.getState().activeTeamId).toBe(
        game.ctx.team1.id
      );
    }
    expect(stateChecksum(host)).toBe(stateChecksum(guest));
  });

  it("a blitz block with a Rush charges the square on both engines", async () => {
    const probe = new HeadlessGame({ scenario: blitzScenario(12), seed: 9 });
    const ma = fixtureValue(probe.ctx.team2.players[0]).stats.MA;

    const { host, guest, board, settled } = twoEngines(
      blitzScenario(3 + ma + 1)
    );
    const blitzer = guest.ctx.team2.players[0];
    const target = guest.ctx.team1.players[0];
    const path = Array.from({ length: ma }, (_, i) => ({ x: 4 + i, y: 5 }));

    forceDice(host.ctx.rng, [6, 3]);
    forceDice(guest.ctx.rng, [6, 3]);

    expect(board.declareAction({ playerId: fixtureValue(blitzer).id, action: "blitz" })).toBe(true);
    await settled();
    await board.movePlayer(fixtureValue(blitzer).id, path);
    await settled();
    board.rollBlockDice({ attackerId: fixtureValue(blitzer).id, defenderId: fixtureValue(target).id, numDice: 1, isAttackerChoice: true });
    await settled();

    expect(guest.ctx.gameService.getMovementUsed(fixtureValue(blitzer).id)).toBe(ma + 1);
    expect(host.ctx.gameService.getMovementUsed(fixtureValue(blitzer).id)).toBe(ma + 1);
    expect(stateChecksum(host)).toBe(stateChecksum(guest));
  });

  it("the board cannot spend a blitz square on the guest's engine alone", async () => {
    const { host, guest, board, settled } = twoEngines(blitzScenario(12));
    const blitzer = guest.ctx.team2.players[0];
    board.declareAction({ playerId: fixtureValue(blitzer).id, action: "blitz" });
    await settled();

    const allowed = await board.chargeBlitzBlockSquare(fixtureValue(blitzer).id);
    await settled();

    expect(allowed).toBe(false);
    expect(guest.ctx.gameService.getMovementUsed(fixtureValue(blitzer).id)).toBe(0);
    expect(host.ctx.gameService.getMovementUsed(fixtureValue(blitzer).id)).toBe(0);
    expect(stateChecksum(host)).toBe(stateChecksum(guest));
  });

  it("a declared Move makes the player active on both engines", async () => {
    const { host, guest, board, settled } = twoEngines(blitzScenario(12));
    const mover = guest.ctx.team2.players[0];

    board.declareAction({ playerId: fixtureValue(mover).id, action: "move" });
    await settled();

    expect(guest.ctx.gameService.getState().activePlayer).toEqual({
      id: fixtureValue(mover).id,
      action: "move",

      stalling: false,
    });
    expect(host.ctx.gameService.getState().activePlayer).toEqual({
      id: fixtureValue(mover).id,
      action: "move",

      stalling: false,
    });
    expect(stateChecksum(host)).toBe(stateChecksum(guest));
  });
});
