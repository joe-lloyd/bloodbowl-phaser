import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase } from "../../src/types/GameState";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { forceDice } from "../utils/test-helpers";
import {
  createMatch,
  playNetworkedMatch,
  handoffScenario,
  kickoffInteractionScenario,
} from "./sessionsHarness";

async function findKickoffSeed(event: KickoffEvent): Promise<number> {
  for (let seed = 1; seed < 400; seed++) {
    const probe = new HeadlessGame({
      scenario: kickoffInteractionScenario,
      seed,
    });
    const response = await probe.execute({
      type: "kick-ball",
      playerId: fixtureValue(probe.ctx.teams[0].players[0]).id,
      x: 14,
      y: 5,
    });
    const result = response.events.find((e) => e.name === "kickoffResult")
      ?.data as { event?: KickoffEvent } | undefined;
    if (
      result?.event === event &&
      response.pendingDecision?.type === "kickoff-event"
    ) {
      return seed;
    }
    if (response.pendingDecision?.type === "kickoff-event") {
      await probe.execute({ type: "kickoff-skip" });
    }
  }
  throw new Error(`no seed found for ${event}`);
}

describe("networked sessions", () => {
  it("proxies a guest Quick Snap selection to the host and mirrors the board", async () => {
    let quickSnapSeed = 0;
    for (let seed = 1; seed < 400 && !quickSnapSeed; seed++) {
      const probe = new HeadlessGame({
        scenario: kickoffInteractionScenario,
        seed,
      });
      const response = await probe.execute({
        type: "kick-ball",
        playerId: fixtureValue(probe.ctx.teams[0].players[0]).id,
        x: 14,
        y: 5,
      });
      const result = response.events.find(
        (event) => event.name === "kickoffResult"
      )?.data as { event?: KickoffEvent } | undefined;
      if (
        result?.event === KickoffEvent.QUICK_SNAP &&
        response.pendingDecision?.type === "kickoff-event"
      ) {
        quickSnapSeed = seed;
      } else if (response.pendingDecision?.type === "kickoff-event") {
        await probe.execute({ type: "kickoff-skip" });
      }
    }
    expect(quickSnapSeed).toBeGreaterThan(0);

    const match = createMatch({
      scenario: kickoffInteractionScenario,
      seed: quickSnapSeed,
    });
    const kicked = await match.host.executeLocal({
      type: "kick-ball",
      playerId: fixtureValue(match.game.ctx.teams[0].players[0]).id,
      x: 14,
      y: 5,
    });
    expect(kicked.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.QUICK_SNAP,
      chooserTeamId: match.guestTeamId,
    });

    const receiver = match.game.ctx.teams[1].players[0];
    const selected = await match.guest.sendCommand({
      type: "kickoff-select-player",
      playerId: fixtureValue(receiver).id,
    });
    expect(selected.ok).toBe(true);
    expect(selected.pendingDecision).toMatchObject({
      selectedPlayerIds: [fixtureValue(receiver).id],
    });

    await match.guest.sendCommand({ type: "kickoff-confirm" });
    const moved = await match.guest.sendCommand({
      type: "kickoff-move-player",
      playerId: fixtureValue(receiver).id,
      x: 13,
      y: fixtureValue(fixtureValue(receiver).gridPosition).y,
    });
    expect(moved.ok).toBe(true);
    expect(fixtureValue(receiver).gridPosition?.x).toBe(13);
    expect(
      moved.snapshot.teams
        .find((team) => team.id === match.guestTeamId)
        ?.players.find((player) => player.id === fixtureValue(receiver).id)?.position?.x
    ).toBe(13);
    expect(
      match.game
        .snapshot()
        .teams.find((team) => team.id === match.guestTeamId)
        ?.players.find((player) => player.id === fixtureValue(receiver).id)?.position
    ).toEqual(
      moved.snapshot.teams
        .find((team) => team.id === match.guestTeamId)
        ?.players.find((player) => player.id === fixtureValue(receiver).id)?.position
    );

    await match.guest.sendCommand({ type: "kickoff-confirm" });
  });

  it("proxies a guest Hand-off by target id and both boards agree", async () => {
    const match = createMatch({ scenario: handoffScenario, seed: 7 });
    const hander = match.game.ctx.teams[1].players[0];
    const receiver = match.game.ctx.teams[1].players[1];

    const declared = await match.guest.sendCommand({
      type: "declare-action",
      playerId: fixtureValue(hander).id,
      action: "handoff",
    });
    expect(declared.ok).toBe(true);

    let response = await match.guest.sendCommand({
      type: "handoff",
      playerId: fixtureValue(hander).id,
      targetId: fixtureValue(receiver).id,
    });
    expect(response.ok).toBe(true);

    expect(response.pendingDecision?.type).not.toBe("interception");

    for (let guard = 0; response.pendingDecision && guard < 5; guard++) {
      expect(response.pendingDecision.type).toBe("reroll");
      response = await match.guest.sendCommand({
        type: "use-reroll",
        accept: false,
      });
    }

    expect(response.snapshot.ballPosition).toEqual(
      match.game.snapshot().ballPosition
    );
  });

  it("proxies a guest High Kick placement to the host and mirrors the board", async () => {
    const match = createMatch({
      scenario: kickoffInteractionScenario,
      seed: 1,
    });

    for (const engine of [match.game, match.guestGame])
      forceDice(engine.ctx.rng, [5, 2, 2, 2, 3]);
    const kicked = await match.host.executeLocal({
      type: "kick-ball",
      playerId: fixtureValue(match.game.ctx.teams[0].players[0]).id,
      x: 14,
      y: 5,
    });
    expect(kicked.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.HIGH_KICK,
      chooserTeamId: match.guestTeamId,
    });
    const landing =
      kicked.pendingDecision?.type === "kickoff-event"
        ? kicked.pendingDecision.landingSquare
        : undefined;
    expect(landing).toBeDefined();

    const receiver = fixtureValue(match.game.ctx.teams[1].players.find(
      (player) =>
        player.gridPosition &&
        (player.gridPosition.x !== fixtureValue(landing).x ||
          player.gridPosition.y !== fixtureValue(landing).y)
    ));

    const selected = await match.guest.sendCommand({
      type: "kickoff-select-player",
      playerId: receiver.id,
    });
    expect(selected.ok).toBe(true);

    const placed = await match.guest.sendCommand({
      type: "kickoff-place-player",
      playerId: receiver.id,
      x: fixtureValue(landing).x,
      y: fixtureValue(landing).y,
    });
    expect(placed.ok).toBe(true);
    expect(receiver.gridPosition).toEqual(landing);
    expect(
      placed.snapshot.teams
        .find((team) => team.id === match.guestTeamId)
        ?.players.find((player) => player.id === receiver.id)?.position
    ).toEqual(landing);

    await match.guest.sendCommand({ type: "kickoff-confirm" });
  });

  it("keeps Alert Defence host-native and blocks the non-owning guest", async () => {
    const seed = await findKickoffSeed(KickoffEvent.ALERT_DEFENCE);
    const match = createMatch({ scenario: kickoffInteractionScenario, seed });
    const kicked = await match.host.executeLocal({
      type: "kick-ball",
      playerId: fixtureValue(match.game.ctx.teams[0].players[0]).id,
      x: 14,
      y: 5,
    });
    expect(kicked.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.ALERT_DEFENCE,
      chooserTeamId: match.hostTeamId,
    });

    const kicker = match.game.ctx.teams[0].players[0];
    expect(fixtureValue(kicker).gridPosition).toEqual({ x: 5, y: 2 });

    const denied = await match.guest.sendCommand({
      type: "kickoff-select-player",
      playerId: fixtureValue(kicker).id,
    });
    expect(denied.ok).toBe(false);
    expect(denied.reason).toBe("not-your-decision");

    const selected = await match.host.executeLocal({
      type: "kickoff-select-player",
      playerId: fixtureValue(kicker).id,
    });
    expect(selected.ok).toBe(true);
    await match.host.executeLocal({ type: "kickoff-confirm" });
    const moved = await match.host.executeLocal({
      type: "kickoff-move-player",
      playerId: fixtureValue(kicker).id,
      x: 6,
      y: 1,
    });
    expect(moved.ok).toBe(true);
    expect(fixtureValue(kicker).gridPosition).toEqual({ x: 6, y: 1 });

    expect(match.broadcasts.length).toBeGreaterThan(0);
  });

  it("keeps Charge! host-native and blocks the non-owning guest's activation", async () => {
    const seed = await findKickoffSeed(KickoffEvent.CHARGE);
    const match = createMatch({ scenario: kickoffInteractionScenario, seed });
    const kicked = await match.host.executeLocal({
      type: "kick-ball",
      playerId: fixtureValue(match.game.ctx.teams[0].players[0]).id,
      x: 14,
      y: 5,
    });
    expect(kicked.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.CHARGE,
      chooserTeamId: match.hostTeamId,
    });

    const chargers = match.game.ctx.teams[0].players.slice(0, 2);
    for (const player of chargers) {
      const selected = await match.host.executeLocal({
        type: "kickoff-select-player",
        playerId: player.id,
      });
      expect(selected.ok).toBe(true);
    }
    const confirmed = await match.host.executeLocal({
      type: "kickoff-confirm",
    });
    expect(confirmed.pendingDecision).toBeNull();

    const deniedDeclare = await match.guest.sendCommand({
      type: "declare-action",
      playerId: fixtureValue(chargers[0]).id,
      action: "move",
    });
    expect(deniedDeclare.ok).toBe(false);
    expect(deniedDeclare.reason).toBe("not-your-turn");

    const declared = await match.host.executeLocal({
      type: "declare-action",
      playerId: fixtureValue(chargers[0]).id,
      action: "move",
    });
    expect(declared.ok).toBe(true);
    const ended = await match.host.executeLocal({
      type: "end-activation",
      playerId: fixtureValue(chargers[0]).id,
    });
    expect(ended.pendingDecision).toBeNull();
    expect(
      match.game.ctx.gameService.canActivate(fixtureValue(chargers[1]).id)
    ).toBe(true);
  });

  it("plays a complete match with every command crossing the wire", async () => {
    const { match, finalSnapshot, commandCount } =
      await playNetworkedMatch(2025);

    expect(
      finalSnapshot.phase,
      JSON.stringify({
        commandCount,
        subPhase: finalSnapshot.subPhase,
        activeTeamId: finalSnapshot.activeTeamId,
        turn: finalSnapshot.turn,
        pending: match.game.pendingDecision(),
      })
    ).toBe(GamePhase.GAME_OVER);
    expect(commandCount).toBeLessThan(600);

    expect(match.broadcasts.length).toBeGreaterThan(0);

    expect(match.resyncs).toBe(0);
  }, 60_000);
});
