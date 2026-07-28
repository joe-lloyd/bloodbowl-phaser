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
import { NetworkedGameService } from "../../src/network/NetworkedGameService";
import type { GameService } from "../../src/services/GameService";
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

  it("regression: a FIRST-TIME placement must not get stuck showing Reserves for the rest of the guest's turn", () => {
    // This is the case the reposition-only tests above do not cover: at the
    // start of every setup every player's status is Reserve (see
    // SetupManager.sanitizeTeam). If the guest's optimistic write path only
    // patched gridPosition (as it used to) and left status untouched, the
    // preserve-guard would capture that stale Reserve status the moment
    // *any* snapshot arrives during the guest's setup turn — not just a
    // racing intermediate one — and reapply it forever, permanently hiding a
    // freshly (and correctly) placed player back in the Reserves box even
    // though gridPosition already points at the pitch.
    const team = createTeamWithPlayersOnPitch("team-1");
    team.players.forEach((player) => {
      player.gridPosition = undefined;
      player.status = PlayerStatus.RESERVE;
    });
    const player = team.players[0];

    const fakeInner = {
      getPlayerById: (id: string) => team.players.find((p) => p.id === id),
    } as unknown as GameService;
    const service = new NetworkedGameService(
      fakeInner,
      async () => ({
        ok: true,
        events: [],
        snapshot: {} as never,
        pendingDecision: null,
      }),
      () => null
    );

    // 1. Guest places a brand-new player on the pitch for the first time.
    service.placePlayer(player.id, 3, 3);
    expect(player.gridPosition).toEqual({ x: 3, y: 3 });
    expect(player.status).toBe(PlayerStatus.ACTIVE);
    expect(playerBoxOf(player)).toBe("pitch");

    // 2. Some snapshot arrives during the guest's own setup turn (could be
    //    this placement's own confirmation, or an unrelated broadcast) —
    //    applyBundle's preserve guard captures the current (optimistic)
    //    state before the snapshot is applied.
    const saved = captureSetupPlacements(team);

    // 3. The authoritative snapshot is applied — correctly, ACTIVE + same
    //    square, exactly matching what the guest already has.
    player.gridPosition = { x: 3, y: 3 };
    player.status = PlayerStatus.ACTIVE;

    // 4. The guard restores the captured state on top.
    restoreSetupPlacements(team, saved);

    expect(player.status).toBe(PlayerStatus.ACTIVE);
    expect(player.gridPosition).toEqual({ x: 3, y: 3 });
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
