import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { type Scenario } from "../../src/types/Scenario";
import { RosterName } from "../../src/types/Team";
import { PlayerStatus } from "../../src/types/Player";
import { LockstepSession } from "../../src/network/LockstepSession";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { createMatch, bloodlustDesyncScenario } from "./sessionsHarness";

const status = (game: HeadlessGame, id: string) =>
  game.ctx.teams[1].players.find((p) => p.id === id)?.status;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("networked sessions", () => {
  it("a Bloodlust bite target is the biting coach's pick, and both boards bite that Thrall", async () => {
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
      const [vampire, first, second] = match.game.ctx.teams[1].players;
      const declared = await match.guest.sendCommand({
        type: "declare-action",
        playerId: fixtureValue(vampire).id,
        action: "move",
      });

      if (declared.pendingDecision?.type !== "reaction") continue;
      await match.guest.sendCommand({ type: "use-reaction", accept: false });
      const ended = await match.guest.sendCommand({
        type: "end-activation",
        playerId: fixtureValue(vampire).id,
      });
      expect(ended.pendingDecision).toMatchObject({
        type: "bite-target",
        chooserTeamId: match.guestTeamId,
        targetIds: [fixtureValue(first).id, fixtureValue(second).id],
      });

      const hostAttempt = await match.host.executeLocal({
        type: "choose-bite-target",
        playerId: fixtureValue(first).id,
      });
      expect(hostAttempt.ok).toBe(false);
      expect(hostAttempt.reason).toBe("not-your-decision");

      const bitten = await match.guest.sendCommand({
        type: "choose-bite-target",
        playerId: fixtureValue(second).id,
      });
      expect(bitten.ok).toBe(true);

      for (const game of [match.game, match.guestGame]) {
        expect(status(game, fixtureValue(second).id)).not.toBe(PlayerStatus.ACTIVE);
        expect(status(game, fixtureValue(first).id)).toBe(PlayerStatus.ACTIVE);
      }
      expect(status(match.guestGame, fixtureValue(second).id)).toBe(
        status(match.game, fixtureValue(second).id)
      );
      expect(match.resyncs).toBe(0);
      return;
    }
    throw new Error("no failed Bloodlust roll in seed range");
  });

  it("keeps a Bloodlust-committed declaration intact through a stale cancel and redeclare (regression: infinite-block desync)", async () => {
    const match = createMatch({ scenario: bloodlustDesyncScenario, seed: 5 });
    const vampire = match.game.ctx.teams[1].players[0];
    const opponent = match.game.ctx.teams[0].players[0];

    const response = await match.guest.sendCommand({
      type: "declare-action",
      playerId: fixtureValue(vampire).id,
      action: "handoff",
    });
    expect(response.ok).toBe(true);

    if (response.pendingDecision?.type === "reaction") {
      await match.guest.sendCommand({
        type: "use-reaction",
        accept: false,
      });
    }

    expect(match.game.ctx.gameService.getState().activePlayer).toMatchObject({
      id: fixtureValue(vampire).id,
      action: "handoff",
      committed: true,
    });

    const cancelled = await match.guest.sendCommand({
      type: "cancel-action",
      playerId: fixtureValue(vampire).id,
    });
    expect(cancelled.ok).toBe(false);
    expect(cancelled.reason).toBe("command-failed: action-already-committed");

    const redeclared = await match.guest.sendCommand({
      type: "declare-action",
      playerId: fixtureValue(vampire).id,
      action: "blitz",
    });

    expect(redeclared.ok).toBe(false);
    expect(redeclared.reason).toBe(
      "command-failed: illegal-action-declaration"
    );

    const blocked = await match.guest.sendCommand({
      type: "block",
      attackerId: fixtureValue(vampire).id,
      defenderId: fixtureValue(opponent).id,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("command-failed: block-not-declared");

    expect(match.game.ctx.gameService.getState().activePlayer).toMatchObject({
      id: fixtureValue(vampire).id,
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
      myTeamId: game.ctx.teams[0].id,
      peerTeamId: game.ctx.teams[1].id,
      hostTeamId: game.ctx.teams[0].id,
    };
    const host = new LockstepSession({
      ...ids,
      transport: hostEnd,
      game,
      selfId: "host-uid",
      onSelection: (payload) => {
        hostSeenSelections.push(payload.playerId);
      },
    });
    const guest = new LockstepSession({
      ...ids,
      myTeamId: ids.peerTeamId,
      peerTeamId: ids.myTeamId,
      transport: guestEnd,
      game,
      selfId: "guest-uid",
      onSelection: (payload) => {
        guestSeenSelections.push(payload.playerId);
      },
    });
    const before = JSON.stringify(game.snapshot());

    const hostPlayerId = fixtureValue(game.ctx.teams[0].players[0]).id;
    await host.sendSelection(hostPlayerId);
    await tick();
    expect(guestSeenSelections).toEqual([hostPlayerId]);

    const guestPlayerId = fixtureValue(game.ctx.teams[1].players[0]).id;
    await guest.sendSelection(guestPlayerId);
    await tick();
    expect(hostSeenSelections).toEqual([guestPlayerId]);

    await guest.sendSelection(null);
    await tick();
    expect(hostSeenSelections).toEqual([guestPlayerId, null]);

    expect(JSON.stringify(game.snapshot())).toBe(before);
    host.close();
    guest.close();
  });

  it("snapshots carry each team's real per-team turn count, not just the active team's", async () => {
    const match = createMatch({ seed: 5, startingPhase: GamePhase.SETUP });
    const { game, hostTeamId, guestTeamId } = match;

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
    expect(fixtureValue(snapshot.turnManager).turnCounts[hostTeamId]).toBe(
      game.ctx.gameService.getTurnNumber(hostTeamId)
    );
    expect(fixtureValue(snapshot.turnManager).turnCounts[guestTeamId]).toBe(
      game.ctx.gameService.getTurnNumber(guestTeamId)
    );
    expect(fixtureValue(snapshot.turnManager).turnCounts[hostTeamId]).toBeGreaterThan(0);
    expect(fixtureValue(snapshot.turnManager).turnCounts[guestTeamId]).toBeGreaterThan(0);
  });

  it("a host force-ending the turn mid-activation does not block the guest's next declaration", async () => {
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
    const attacker = match.game.ctx.teams[0].players[0];
    const guestMover = match.game.ctx.teams[1].players[0];

    const declared = await match.host.executeLocal({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    expect(declared.ok).toBe(true);
    const moved = await match.host.executeLocal({
      type: "move",
      playerId: fixtureValue(attacker).id,
      path: [{ x: 11, y: 5 }],
    });
    expect(moved.ok).toBe(true);

    const ended = await match.host.executeLocal({ type: "end-turn" });
    expect(ended.ok).toBe(true);
    expect(ended.snapshot.activeTeamId).toBe(match.guestTeamId);
    expect(ended.snapshot.activePlayer).toBeNull();

    const guestDeclared = await match.guest.sendCommand({
      type: "declare-action",
      playerId: fixtureValue(guestMover).id,
      action: "move",
    });
    expect(guestDeclared.ok).toBe(true);
  });

  it("lets the blocking guest spend a team re-roll on its block dice", async () => {
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
    match.game.ctx.teams[1].rerolls = 2;
    match.guestGame.ctx.teams[1].rerolls = 2;
    const [attacker] = match.game.ctx.teams[1].players;
    const [defender] = match.game.ctx.teams[0].players;

    await match.guest.sendCommand({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    const rolled = await match.guest.sendCommand({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    expect(rolled.pendingDecision?.type).toBe("block-dice");

    const rerolled = await match.guest.sendCommand({
      type: "team-reroll-block",
      attackerId: fixtureValue(attacker).id,
    });
    expect(rerolled.reason).toBeUndefined();
    expect(rerolled.ok).toBe(true);
    expect(rerolled.snapshot.teamRerollsUsed?.[match.guestTeamId]).toBe(1);
    expect(match.resyncs).toBe(0);
  });
});
