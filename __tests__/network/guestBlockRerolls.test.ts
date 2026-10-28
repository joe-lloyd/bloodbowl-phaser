/**
 * A guest re-rolling their own block dice. The re-roll is sent while the
 * block dice are the pending decision, so the ownership gate has to treat
 * it as an answer to that decision rather than a new command.
 */
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { CommandResponse } from "../../src/headless/protocol";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { HostSession } from "../../src/network/HostSession";
import { GuestSession } from "../../src/network/GuestSession";
import { createInMemoryTransportPair } from "../../src/network/transport";

const guestBlocks: Scenario = {
  id: "guest-block-reroll",
  name: "Guest blocks",
  description: "",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 8, y: 5 },
      { playerIndex: 1, x: 2, y: 9 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 9, y: 5 },
      { playerIndex: 1, x: 17, y: 9 },
    ],
    activeTeam: "team2",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

describe("guest block re-rolls", () => {
  it("the gate lets the blocking guest spend a team re-roll on the dice", async () => {
    const game = new HeadlessGame({ scenario: guestBlocks, seed: 3 });
    const guestTeam = game.ctx.team2;
    guestTeam.rerolls = 2;
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const host = new HostSession({
      transport: hostEnd,
      game,
      hostTeamId: game.ctx.team1.id,
      guestTeamId: guestTeam.id,
      selfId: "host-uid",
    });
    const guest = new GuestSession({
      transport: guestEnd,
      selfId: "guest-uid",
    });
    const [attacker] = guestTeam.players;
    const [defender] = game.ctx.team1.players;

    await guest.sendCommand({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    const rolled = await guest.sendCommand({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    expect(rolled.pendingDecision?.type).toBe("block-dice");

    const rerolled: CommandResponse = await guest.sendCommand({
      type: "team-reroll-block",
      attackerId: attacker.id,
    });
    expect(rerolled.reason).toBeUndefined();
    expect(rerolled.ok).toBe(true);
    expect(rerolled.snapshot.teamRerollsUsed?.[guestTeam.id]).toBe(1);
    host.close();
    guest.close();
  });
});
