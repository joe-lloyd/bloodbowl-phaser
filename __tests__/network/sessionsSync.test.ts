/**
 * Host/guest sessions: both boards stay in step through Bloodlust, selection
 * changes, a forced turn end and a re-roll on block dice.
 */

import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { Scenario } from "../../src/types/Scenario";
import { RosterName } from "../../src/types/Team";
import { PlayerStatus } from "../../src/types/Player";
import { LockstepSession } from "../../src/network/LockstepSession";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { createMatch, bloodlustDesyncScenario } from "./sessionsHarness";

describe("networked sessions", () => {
  it("a Bloodlust bite target is the biting coach's pick, and both boards bite that Thrall", async () => {
    // The guest's Bloodlust player fails beside two Thrall Linemen
    const biteScenario: Scenario = {
      id: "online-bloodlust-bite-target",
      name: "Online Bloodlust bite target",
      description: "a guest Bloodlust player beside two Thrall Linemen",
      setup: {
        team2Roster: RosterName.VAMPIRE,
        team1Placements: [{ playerIndex: 0, x: 18, y: 8 }],
        team2Placements: [
          {
            playerIndex: 0,
            x: 10,
            y: 5,
            skills: [{ type: SkillType.BLOODLUST, parameter: "2+" }],
          },
          { playerIndex: 1, x: 11, y: 5 },
          { playerIndex: 2, x: 10, y: 6 },
          { playerIndex: 3, x: 3, y: 9 },
        ],
        activeTeam: "team2",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    };

    for (let seed = 1; seed <= 60; seed++) {
      const match = createMatch({ scenario: biteScenario, seed });
      const [vampire, first, second] = match.game.ctx.team2.players;
      const declared = await match.guest.sendCommand({
        type: "declare-action",
        playerId: vampire.id,
        action: "move",
      });
      // Only a failed roll asks about switching to a Move
      if (declared.pendingDecision?.type !== "reaction") continue;
      await match.guest.sendCommand({ type: "use-reaction", accept: false });
      const ended = await match.guest.sendCommand({
        type: "end-activation",
        playerId: vampire.id,
      });
      expect(ended.pendingDecision).toMatchObject({
        type: "bite-target",
        chooserTeamId: match.guestTeamId,
        targetIds: [first.id, second.id],
      });

      // The other coach may not choose for them
      const hostAttempt = await match.host.executeLocal({
        type: "choose-bite-target",
        playerId: first.id,
      });
      expect(hostAttempt.ok).toBe(false);
      expect(hostAttempt.reason).toBe("not-your-decision");

      const bitten = await match.guest.sendCommand({
        type: "choose-bite-target",
        playerId: second.id,
      });
      expect(bitten.ok).toBe(true);
      // Both engines bit the same Thrall, and only that one
      const status = (game: HeadlessGame, id: string) =>
        game.ctx.team2.players.find((p) => p.id === id)?.status;
      for (const game of [match.game, match.guestGame]) {
        expect(status(game, second.id)).not.toBe(PlayerStatus.ACTIVE);
        expect(status(game, first.id)).toBe(PlayerStatus.ACTIVE);
      }
      expect(status(match.guestGame, second.id)).toBe(
        status(match.game, second.id)
      );
      expect(match.resyncs).toBe(0);
      return;
    }
    throw new Error("no failed Bloodlust roll in seed range");
  });

  // Regression for a captured bug report: "something fell out of sync and
  // ended up causing infinite roll for a block and skipped the Bloodlust
  // roll". The Bloodlust gate COMMITS the declaration the instant it fires
  // (win or lose the roll — see ActivationGateOperation), before the guest
  // could plausibly have clicked "Back" in response to seeing it. This test
  // pins the host-side half of the bug: once committed, a stale cancel and
  // a stale redeclare must both be refused, consistently and without ever
  // mutating the original committed declaration — exactly the three
  // rejections the captured log shows in sequence (action-already-
  // committed, illegal-action-declaration, block-not-declared). The first
  // declaration is a once-per-turn action (Hand-off): only once-per-turn
  // actions carry the release/refuse guard the redeclare must trip (Move,
  // Block, and the special actions have no team allowance at stake and so
  // permit free re-declaration by design — see ONCE_PER_TURN_ACTIONS in
  // GameService). The other half of the bug — the guest's local UI trusting
  // its own optimistic "success" through these rejections and getting
  // stuck — is covered at the NetworkedGameService layer in
  // defer-action-commitment.test.ts.
  it("keeps a Bloodlust-committed declaration intact through a stale cancel and redeclare (regression: infinite-block desync)", async () => {
    const match = createMatch({ scenario: bloodlustDesyncScenario, seed: 5 });
    const vampire = match.game.ctx.team2.players[0];
    const opponent = match.game.ctx.team1.players[0];

    let response = await match.guest.sendCommand({
      type: "declare-action",
      playerId: vampire.id,
      action: "handoff",
    });
    expect(response.ok).toBe(true);

    // A failed Bloodlust roll offers a reaction (downgrade to Move) —
    // decline it so the committed action is deterministically Hand-off
    // regardless of how the die landed.
    if (response.pendingDecision?.type === "reaction") {
      response = await match.guest.sendCommand({
        type: "use-reaction",
        accept: false,
      });
    }

    expect(match.game.ctx.gameService.getState().activePlayer).toMatchObject({
      id: vampire.id,
      action: "handoff",
      committed: true,
    });

    // A stale guest UI tries to cancel the now-committed declaration.
    const cancelled = await match.guest.sendCommand({
      type: "cancel-action",
      playerId: vampire.id,
    });
    expect(cancelled.ok).toBe(false);
    expect(cancelled.reason).toBe("command-failed: action-already-committed");

    // ...then, believing the cancel went through, redeclares into a
    // different once-per-turn action as if starting fresh.
    const redeclared = await match.guest.sendCommand({
      type: "declare-action",
      playerId: vampire.id,
      action: "blitz",
    });
    // The once-per-turn commit guard refuses the Blitz redeclare outright —
    // the committed Hand-off is still live.
    expect(redeclared.ok).toBe(false);
    expect(redeclared.reason).toBe(
      "command-failed: illegal-action-declaration"
    );

    // ...then, believing the Blitz declaration went through, tries to Block
    // — refused: no Block/Blitz was ever actually declared and committed.
    const blocked = await match.guest.sendCommand({
      type: "block",
      attackerId: vampire.id,
      defenderId: opponent.id,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("command-failed: block-not-declared");

    // The original committed Hand-off survives every stale/forged
    // follow-up untouched.
    expect(match.game.ctx.gameService.getState().activePlayer).toMatchObject({
      id: vampire.id,
      action: "handoff",
      committed: true,
    });
  });

  it("delivers a selection-change envelope host→guest and guest→host without touching game state", async () => {
    const game = new HeadlessGame({ seed: 3, startingPhase: GamePhase.SETUP });
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const hostSeenSelections: (string | null)[] = [];
    const guestSeenSelections: (string | null)[] = [];
    const ids = {
      myTeamId: game.ctx.team1.id,
      peerTeamId: game.ctx.team2.id,
      hostTeamId: game.ctx.team1.id,
    };
    const host = new LockstepSession({
      ...ids,
      transport: hostEnd,
      game,
      selfId: "host-uid",
      onSelection: (payload) => hostSeenSelections.push(payload.playerId),
    });
    const guest = new LockstepSession({
      ...ids,
      myTeamId: ids.peerTeamId,
      peerTeamId: ids.myTeamId,
      transport: guestEnd,
      game,
      selfId: "guest-uid",
      onSelection: (payload) => guestSeenSelections.push(payload.playerId),
    });
    const before = JSON.stringify(game.snapshot());
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    const hostPlayerId = game.ctx.team1.players[0].id;
    await host.sendSelection(hostPlayerId);
    await tick();
    expect(guestSeenSelections).toEqual([hostPlayerId]);

    const guestPlayerId = game.ctx.team2.players[0].id;
    await guest.sendSelection(guestPlayerId);
    await tick();
    expect(hostSeenSelections).toEqual([guestPlayerId]);

    await guest.sendSelection(null);
    await tick();
    expect(hostSeenSelections).toEqual([guestPlayerId, null]);

    // Purely cosmetic: no game command executed, no state changed.
    expect(JSON.stringify(game.snapshot())).toBe(before);
    host.close();
    guest.close();
  });

  it("snapshots carry each team's real per-team turn count, not just the active team's", async () => {
    // Regression for "the turn counter never goes up for the non-host": the
    // guest's scoreboard reads getTurnNumber(teamId) for BOTH teams, backed
    // by TurnManager.turnCounts — a field that lives outside GameState and
    // must ride along on the snapshot as its own sidecar field.
    const match = createMatch({ seed: 5, startingPhase: GamePhase.SETUP });
    const { game, hostTeamId, guestTeamId } = match;

    // startGame() starts the RECEIVING team's turn first; route each
    // end-turn through whichever side actually owns the active turn (same
    // routing `run()`/`senderSide()` use in the other session tests) so the
    // ownership gate doesn't reject an out-of-turn call.
    // Outside the protocol, so on both engines by hand
    game.ctx.gameService.startGame(hostTeamId);
    match.guestGame.ctx.gameService.startGame(hostTeamId);
    for (let i = 0; i < 2; i++) {
      const active = game.ctx.gameService.getState().activeTeamId;
      const response =
        active === guestTeamId
          ? await match.guest.sendCommand({ type: "end-turn" })
          : await match.host.executeLocal({ type: "end-turn" });
      expect(response.ok).toBe(true);
    }

    const snapshot = game.snapshot();
    expect(snapshot.turnManager).toBeDefined();
    expect(snapshot.turnManager!.turnCounts[hostTeamId]).toBe(
      game.ctx.gameService.getTurnNumber(hostTeamId)
    );
    expect(snapshot.turnManager!.turnCounts[guestTeamId]).toBe(
      game.ctx.gameService.getTurnNumber(guestTeamId)
    );
    expect(snapshot.turnManager!.turnCounts[hostTeamId]).toBeGreaterThan(0);
    expect(snapshot.turnManager!.turnCounts[guestTeamId]).toBeGreaterThan(0);
  });

  it("a host force-ending the turn mid-activation does not block the guest's next declaration", async () => {
    // Regression for "the timer hitting zero doesn't seem to end the turn
    // properly": force-ending the turn (the online clock, or a manual End
    // Turn click) used to leave a stale, committed state.activePlayer that
    // refused the next team's very first declareAction() over the wire.
    const forceEndScenario: Scenario = {
      id: "online-force-end-turn",
      name: "Online force end turn",
      description:
        "Host force-ends the turn mid-activation; the guest must be able to act immediately.",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
        team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    };
    const match = createMatch({ scenario: forceEndScenario, seed: 3 });
    const attacker = match.game.ctx.team1.players[0];
    const guestMover = match.game.ctx.team2.players[0];

    const declared = await match.host.executeLocal({
      type: "declare-action",
      playerId: attacker.id,
      action: "blitz",
    });
    expect(declared.ok).toBe(true);
    const moved = await match.host.executeLocal({
      type: "move",
      playerId: attacker.id,
      path: [{ x: 11, y: 5 }],
    });
    expect(moved.ok).toBe(true);

    // Force-end without ever finishing the activation — same GameService
    // .endTurn() call the online clock (TurnClock) and the End Turn button
    // both make directly, bypassing end-activation.
    const ended = await match.host.executeLocal({ type: "end-turn" });
    expect(ended.ok).toBe(true);
    expect(ended.snapshot.activeTeamId).toBe(match.guestTeamId);
    expect(ended.snapshot.activePlayer).toBeNull();

    const guestDeclared = await match.guest.sendCommand({
      type: "declare-action",
      playerId: guestMover.id,
      action: "move",
    });
    expect(guestDeclared.ok).toBe(true);
  });

  it("lets the blocking guest spend a team re-roll on its block dice", async () => {
    // The re-roll is sent while the block dice are the pending decision,
    // so the gate must treat it as an answer to that decision.
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
    const match = createMatch({ scenario: guestBlocks, seed: 3 });
    match.game.ctx.team2.rerolls = 2;
    match.guestGame.ctx.team2.rerolls = 2;
    const [attacker] = match.game.ctx.team2.players;
    const [defender] = match.game.ctx.team1.players;

    await match.guest.sendCommand({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    const rolled = await match.guest.sendCommand({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    expect(rolled.pendingDecision?.type).toBe("block-dice");

    const rerolled = await match.guest.sendCommand({
      type: "team-reroll-block",
      attackerId: attacker.id,
    });
    expect(rerolled.reason).toBeUndefined();
    expect(rerolled.ok).toBe(true);
    expect(rerolled.snapshot.teamRerollsUsed?.[match.guestTeamId]).toBe(1);
    expect(match.resyncs).toBe(0);
  });
});
