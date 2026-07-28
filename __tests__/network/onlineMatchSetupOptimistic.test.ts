/**
 * Regression coverage for the guest-side "preserve my own in-flight setup
 * placements" guard in OnlineMatch.applyBundle (see
 * openspec/changes/fix-multiplayer-setup-optimistic-render).
 *
 * When a guest repositions an already-placed player during their own setup
 * turn, a stale intermediate host snapshot can otherwise land between the
 * optimistic move and the final confirmation, flipping the player's dugout
 * box to Reserves even though gridPosition already points at the new pitch
 * square. playerBoxOf() checks status before gridPosition, so status has to
 * be preserved alongside position — this exercises exactly that.
 */

import { describe, it, expect } from "vitest";
import {
  shouldPreserveOwnSetup,
  captureSetupPlacements,
  restoreSetupPlacements,
} from "../../src/network/OnlineMatch";
import { GamePhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { playerBoxOf } from "../../src/game/rules/playerLocation";
import { createTeamWithPlayersOnPitch } from "../fixtures/teams";

describe("OnlineMatch setup-placement optimistic preserve guard", () => {
  describe("shouldPreserveOwnSetup", () => {
    it("is true during my own setup turn", () => {
      expect(
        shouldPreserveOwnSetup(
          { phase: GamePhase.SETUP, activeTeamId: "team-1" },
          "team-1"
        )
      ).toBe(true);
    });

    it("is false once it is no longer my active turn", () => {
      expect(
        shouldPreserveOwnSetup(
          { phase: GamePhase.SETUP, activeTeamId: "team-2" },
          "team-1"
        )
      ).toBe(false);
    });

    it("is false outside setup", () => {
      expect(
        shouldPreserveOwnSetup(
          { phase: GamePhase.PLAY, activeTeamId: "team-1" },
          "team-1"
        )
      ).toBe(false);
    });
  });

  it("restores both gridPosition and status, so a stale intermediate 'removed' snapshot never flips the player to Reserves", () => {
    const team = createTeamWithPlayersOnPitch("team-1");
    const player = team.players[0];
    // Before the reposition drag: on the pitch at its original square.
    player.gridPosition = { x: 2, y: 5 };
    player.status = PlayerStatus.ACTIVE;

    // 1. Capture the optimistic state before an authoritative snapshot lands.
    const saved = captureSetupPlacements(team);

    // 2. The reposition is already applied locally (optimistic move to the
    //    new square) by the time a network response arrives...
    player.gridPosition = { x: 3, y: 5 };
    player.status = PlayerStatus.ACTIVE;

    // ...but the arriving snapshot is the host's now-stale INTERMEDIATE
    // "remove-player" response: the old remove+place split used to send two
    // commands, and this is what the first one's response looked like.
    const staleSnapshotState = {
      gridPosition: undefined as { x: number; y: number } | undefined,
      status: PlayerStatus.RESERVE,
    };
    player.gridPosition = staleSnapshotState.gridPosition;
    player.status = staleSnapshotState.status;
    expect(playerBoxOf(player)).toBe("reserves"); // the bug, if unguarded

    // 3. Re-capture what SHOULD be trusted (the optimistic new-square state)
    //    and restore it, exactly like applyBundle does after
    //    applySnapshotToTeams.
    const beforeRepositionSaved = new Map(saved);
    beforeRepositionSaved.set(player.id, {
      gridPosition: { x: 3, y: 5 },
      status: PlayerStatus.ACTIVE,
    });
    restoreSetupPlacements(team, beforeRepositionSaved);

    expect(player.gridPosition).toEqual({ x: 3, y: 5 });
    expect(player.status).toBe(PlayerStatus.ACTIVE);
    expect(playerBoxOf(player)).toBe("pitch");
  });

  it("captureSetupPlacements + restoreSetupPlacements round-trips every player unchanged when nothing else touches them", () => {
    const team = createTeamWithPlayersOnPitch("team-1");
    const saved = captureSetupPlacements(team);

    // Simulate applySnapshotToTeams clobbering everyone with a stale state.
    team.players.forEach((player) => {
      player.gridPosition = undefined;
      player.status = PlayerStatus.RESERVE;
    });

    restoreSetupPlacements(team, saved);

    team.players.forEach((player, index) => {
      expect(player.status).toBe(PlayerStatus.ACTIVE);
      expect(player.gridPosition).toEqual(
        [
          { x: 2, y: 5 },
          { x: 3, y: 3 },
          { x: 3, y: 7 },
          { x: 4, y: 5 },
          { x: 5, y: 2 },
          { x: 5, y: 8 },
          { x: 5, y: 5 },
        ][index]
      );
    });
  });
});
