/**
 * The board drives an online match through NetworkedGameService. Every call
 * that changes the game must reach both engines, so the coach on the move
 * and the coach watching hold the same state once the command has crossed.
 * Two engines over the in-memory transport, the guest's driven through the
 * networked service the way the board drives it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stateChecksum } from "../../src/headless/checksum";
import { LockstepSession } from "../../src/network/LockstepSession";
import { NetworkedGameService } from "../../src/network/NetworkedGameService";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";

afterEach(() => vi.restoreAllMocks());

/** The guest's blitzer on 3,5 and the host's target further down row 5. */
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
  const board = new NetworkedGameService(
    guest.ctx.gameService,
    (command) => guestSession.run(command),
    () => guest.pendingDecision()
  );
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
  it("a blitz block with a Rush charges the square on both engines", async () => {
    const probe = new HeadlessGame({ scenario: blitzScenario(12), seed: 9 });
    const ma = probe.ctx.team2.players[0].stats.MA;
    // MA squares down row 5 end next to the target, so the block is a Rush
    const { host, guest, board, settled } = twoEngines(
      blitzScenario(3 + ma + 1)
    );
    const blitzer = guest.ctx.team2.players[0];
    const target = guest.ctx.team1.players[0];
    const path = Array.from({ length: ma }, (_, i) => ({ x: 4 + i, y: 5 }));
    // Rush passes on both engines, then a Push on the block die
    forceDice(host.ctx.rng, [6, 3]);
    forceDice(guest.ctx.rng, [6, 3]);

    expect(board.declareAction(blitzer.id, "blitz")).toBe(true);
    await settled();
    await board.movePlayer(blitzer.id, path);
    await settled();
    board.rollBlockDice(blitzer.id, target.id, 1, true);
    await settled();

    expect(guest.ctx.gameService.getMovementUsed(blitzer.id)).toBe(ma + 1);
    expect(host.ctx.gameService.getMovementUsed(blitzer.id)).toBe(ma + 1);
    expect(stateChecksum(host)).toBe(stateChecksum(guest));
  });

  it("the board cannot spend a blitz square on the guest's engine alone", async () => {
    const { host, guest, board, settled } = twoEngines(blitzScenario(12));
    const blitzer = guest.ctx.team2.players[0];
    board.declareAction(blitzer.id, "blitz");
    await settled();

    const allowed = await board.chargeBlitzBlockSquare(blitzer.id);
    await settled();

    // The block command charges the square on both engines; a charge from
    // the board on its own would leave the two engines a square apart
    expect(allowed).toBe(false);
    expect(guest.ctx.gameService.getMovementUsed(blitzer.id)).toBe(0);
    expect(host.ctx.gameService.getMovementUsed(blitzer.id)).toBe(0);
    expect(stateChecksum(host)).toBe(stateChecksum(guest));
  });

  it("a declared Move makes the player active on both engines", async () => {
    const { host, guest, board, settled } = twoEngines(blitzScenario(12));
    const mover = guest.ctx.team2.players[0];

    board.declareAction(mover.id, "move");
    await settled();

    expect(guest.ctx.gameService.getState().activePlayer).toEqual({
      id: mover.id,
      action: "move",
    });
    expect(host.ctx.gameService.getState().activePlayer).toEqual({
      id: mover.id,
      action: "move",
    });
    expect(stateChecksum(host)).toBe(stateChecksum(guest));
  });
});
