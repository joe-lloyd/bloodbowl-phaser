/**
 * Host/guest sessions over an in-memory transport: the same scripted match
 * the headless suite plays, but with every command routed through the
 * network layer — host commands via HostSession.executeLocal, guest commands
 * via GuestSession.sendCommand — plus ownership and resync behavior.
 */

import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  HeadlessCommand,
  CommandResponse,
  PendingDecision,
} from "../../src/headless/protocol";
import { GameSnapshot } from "../../src/headless/serialization";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType, SkillCategory } from "../../src/types/Skills";
import { Scenario } from "../../src/types/Scenario";
import { HostSession } from "../../src/network/HostSession";
import { GuestSession } from "../../src/network/GuestSession";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { Envelope } from "../../src/network/envelope";
import { decisionOwner, checkOwnership } from "../../src/network/OwnershipGate";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";

interface Match {
  game: HeadlessGame;
  host: HostSession;
  guest: GuestSession;
  hostTeamId: string;
  guestTeamId: string;
  broadcasts: HeadlessCommand[];
  resyncs: number;
}

function createMatch(options: ConstructorParameters<typeof HeadlessGame>[0]) {
  const game = new HeadlessGame(options);
  const hostTeamId = game.ctx.team1.id;
  const guestTeamId = game.ctx.team2.id;
  const [hostEnd, guestEnd] = createInMemoryTransportPair();

  const match: Match = {
    game,
    hostTeamId,
    guestTeamId,
    broadcasts: [],
    resyncs: 0,
    host: null as unknown as HostSession,
    guest: null as unknown as GuestSession,
  };

  match.host = new HostSession({
    transport: hostEnd,
    game,
    hostTeamId,
    guestTeamId,
    selfId: "host-uid",
  });
  match.guest = new GuestSession({
    transport: guestEnd,
    selfId: "guest-uid",
    onBroadcast: (payload) => match.broadcasts.push(payload.command),
    onResync: () => match.resyncs++,
  });
  return match;
}

/** Which side owns this command (test routing mirrors the gate's rules). */
function senderSide(
  match: Match,
  command: HeadlessCommand,
  pending: PendingDecision | null
): "host" | "guest" {
  const teamOf = (playerId: string) =>
    match.game.ctx.gameService.getPlayerById(playerId)?.teamId;
  const side = (teamId: string | undefined) =>
    teamId === match.guestTeamId ? "guest" : "host";

  if (pending) {
    return side(
      decisionOwner(pending, {
        activeTeamId: null,
        pendingDecision: pending,
        teamIdOfPlayer: teamOf,
        hostTeamId: match.hostTeamId,
      })
    );
  }
  switch (command.type) {
    case "coin-flip":
    case "start-setup":
    case "state":
    case "legal-actions":
    case "end-turn":
      return command.type === "end-turn"
        ? side(match.game.ctx.gameService.getState().activeTeamId ?? undefined)
        : "host";
    case "confirm-setup":
      return side(command.teamId);
    case "block":
      return side(teamOf(command.attackerId));
    default: {
      const playerId = (command as { playerId?: string }).playerId;
      return playerId ? side(teamOf(playerId)) : "host";
    }
  }
}

async function run(
  match: Match,
  command: HeadlessCommand
): Promise<CommandResponse> {
  const pending = match.game.pendingDecision();
  // Queries route through the host directly (both sides may query)
  if (command.type === "state" || command.type === "legal-actions") {
    return match.host.executeLocal(command);
  }
  return senderSide(match, command, pending) === "guest"
    ? match.guest.sendCommand(command)
    : match.host.executeLocal(command);
}

/** The fullGame.test.ts bot, with commands routed through the sessions. */
async function playNetworkedMatch(seed: number): Promise<{
  match: Match;
  finalSnapshot: GameSnapshot;
  commandCount: number;
}> {
  const match = createMatch({ seed, startingPhase: GamePhase.SETUP });
  const { game } = match;
  let commandCount = 0;
  let kickingTeamId: string | null = null;

  const exec = async (command: HeadlessCommand) => {
    commandCount++;
    return run(match, command);
  };

  const MAX_COMMANDS = 600;
  while (commandCount < MAX_COMMANDS) {
    const snap = game.snapshot();
    if (snap.phase === GamePhase.GAME_OVER) break;

    const pending = game.pendingDecision();
    if (pending) {
      if (pending.type === "kickoff-event") {
        await exec({ type: "kickoff-skip" });
      } else if (pending.type === "block-dice") {
        await exec({ type: "choose-block-result", index: 0 });
      } else if (pending.type === "push-direction") {
        const dir = pending.options[0];
        await exec({ type: "choose-push-direction", x: dir.x, y: dir.y });
      } else if (pending.type === "touchback") {
        const receiver = snap.teams
          .find((t) => t.id === pending.teamId)!
          .players.find((p) => p.position && p.status === "Active")!;
        await exec({ type: "touchback", playerId: receiver.id });
      } else if (pending.type === "reroll") {
        await exec({ type: "use-reroll", accept: false });
      } else if (pending.type === "reaction") {
        await exec({ type: "use-reaction", accept: false });
      } else if (pending.type === "interception") {
        await exec({ type: "choose-interception" });
      } else {
        await exec({ type: "choose-follow-up", followUp: true });
      }
      continue;
    }

    if (snap.phase === GamePhase.SETUP) {
      if (
        snap.subPhase === SubPhase.SETUP_KICKING ||
        snap.subPhase === SubPhase.SETUP_RECEIVING
      ) {
        if (snap.subPhase === SubPhase.SETUP_KICKING) {
          kickingTeamId = snap.activeTeamId;
        }
        const teamId = snap.activeTeamId!;
        await placeTeam(match, exec, snap, teamId);
        await exec({ type: "confirm-setup", teamId });
      } else {
        await exec({ type: "coin-flip" });
      }
      continue;
    }

    if (snap.phase === GamePhase.KICKOFF) {
      const kickerTeam = snap.teams.find((t) => t.id === kickingTeamId)!;
      const kicker = kickerTeam.players.find((p) => p.position)!;
      const isTeam1 = kickerTeam.id === snap.teams[0].id;
      const target = isTeam1 ? { x: 15, y: 5 } : { x: 4, y: 5 };
      const kicked = await exec({
        type: "kick-ball",
        playerId: kicker.id,
        x: target.x,
        y: target.y,
      });
      if (!kicked.ok) throw new Error(`kick failed: ${kicked.reason}`);
      continue;
    }

    if (snap.phase === GamePhase.PLAY) {
      const legal = await exec({ type: "legal-actions" });
      const candidates = legal.legalActions!.players.filter((p) =>
        p.actions.includes("move")
      );
      if (candidates.length === 0) {
        await exec({ type: "end-turn" });
        continue;
      }

      const actor = candidates[0];
      const detailed = await exec({
        type: "legal-actions",
        playerId: actor.playerId,
      });
      const targets =
        detailed.legalActions!.players.find(
          (p) => p.playerId === actor.playerId
        )?.moveTargets ?? [];

      const me = snap.teams
        .flatMap((t) => t.players)
        .find((p) => p.id === actor.playerId)!;
      const goalRight = me.teamId === snap.teams[0].id;
      const adjacent = targets
        .filter(
          (t) =>
            Math.abs(t.x - me.position!.x) <= 1 &&
            Math.abs(t.y - me.position!.y) <= 1
        )
        .sort((a, b) => (goalRight ? b.x - a.x : a.x - b.x));

      if (adjacent.length === 0) {
        await exec({ type: "end-activation", playerId: actor.playerId });
        await exec({ type: "end-turn" });
        continue;
      }

      await exec({
        type: "declare-action",
        playerId: actor.playerId,
        action: "move",
      });
      await exec({
        type: "move",
        playerId: actor.playerId,
        path: [adjacent[0]],
      });
      await exec({ type: "end-activation", playerId: actor.playerId });
      await exec({ type: "end-turn" });
      continue;
    }

    throw new Error(`Bot stuck in phase ${snap.phase}/${snap.subPhase}`);
  }

  return { match, finalSnapshot: game.snapshot(), commandCount };
}

async function placeTeam(
  match: Match,
  exec: (cmd: HeadlessCommand) => Promise<CommandResponse>,
  snap: GameSnapshot,
  teamId: string
): Promise<void> {
  const zone = match.game.ctx.gameService.getSetupZone(teamId)!;
  const team = snap.teams.find((t) => t.id === teamId)!;
  const eligible = team.players.filter(
    (p) => p.status === "Active" || p.status === "Reserve"
  );
  const positioned = eligible.filter((p) => p.position);
  const toPlace = eligible
    .filter((p) => !p.position)
    .slice(0, Math.max(0, 7 - positioned.length));

  const occupied = new Set(
    snap.teams
      .flatMap((t) => t.players)
      .filter((p) => p.position)
      .map((p) => `${p.position!.x},${p.position!.y}`)
  );

  const lineX = teamId === snap.teams[0].id ? zone.maxX : zone.minX;
  let placed = 0;
  outer: for (
    let x = lineX;
    x >= zone.minX && x <= zone.maxX;
    x += teamId === snap.teams[0].id ? -1 : 1
  ) {
    for (let y = 2; y <= 8; y++) {
      if (placed >= toPlace.length) break outer;
      if (occupied.has(`${x},${y}`)) continue;
      const player = toPlace[placed];
      const response = await exec({
        type: "place-player",
        playerId: player.id,
        x,
        y,
      });
      if (response.ok) {
        occupied.add(`${x},${y}`);
        placed++;
      }
    }
  }
}

/** Attacker adjacent to a defender who has an assist → uphill, defender picks. */
const uphillScenario: Scenario = {
  id: "uphill-test",
  name: "Uphill block",
  description: "defender assisted, so the defender chooses the die",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5 },
      { playerIndex: 1, x: 10, y: 4 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

/** Team2 (the guest) is active; player0 holds the ball, adjacent to player1. */
const handoffScenario: Scenario = {
  id: "online-handoff",
  name: "Online hand-off",
  description: "Guest's own player hands off to an adjacent team-mate.",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 20, y: 8 }],
    team2Placements: [
      { playerIndex: 0, x: 4, y: 5 },
      { playerIndex: 1, x: 5, y: 5 },
    ],
    activeTeam: "team2",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 4, y: 5 },
  },
};

const kickoffInteractionScenario: Scenario = {
  id: "online-kickoff-interaction",
  name: "Online kickoff interaction",
  description: "Open teams ready for a team-one kick.",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 5,
      y: playerIndex + 2,
    })),
    team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 14,
      y: playerIndex + 2,
    })),
    activeTeam: "team2",
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
};

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
        playerId: probe.ctx.team1.players[0].id,
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
      playerId: match.game.ctx.team1.players[0].id,
      x: 14,
      y: 5,
    });
    expect(kicked.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.QUICK_SNAP,
      chooserTeamId: match.guestTeamId,
    });

    const receiver = match.game.ctx.team2.players[0];
    const selected = await match.guest.sendCommand({
      type: "kickoff-select-player",
      playerId: receiver.id,
    });
    expect(selected.ok).toBe(true);
    expect(selected.pendingDecision).toMatchObject({
      selectedPlayerIds: [receiver.id],
    });

    const moved = await match.guest.sendCommand({
      type: "kickoff-move-player",
      playerId: receiver.id,
      x: 13,
      y: receiver.gridPosition!.y,
    });
    expect(moved.ok).toBe(true);
    expect(receiver.gridPosition?.x).toBe(13);
    expect(
      moved.snapshot.teams
        .find((team) => team.id === match.guestTeamId)
        ?.players.find((player) => player.id === receiver.id)?.position?.x
    ).toBe(13);
    expect(
      match.game.snapshot().teams
        .find((team) => team.id === match.guestTeamId)
        ?.players.find((player) => player.id === receiver.id)?.position
    ).toEqual(
      moved.snapshot.teams
        .find((team) => team.id === match.guestTeamId)
        ?.players.find((player) => player.id === receiver.id)?.position
    );

    await match.guest.sendCommand({ type: "kickoff-confirm" });
  });

  it("proxies a guest Hand-off by target id and both boards agree", async () => {
    const match = createMatch({ scenario: handoffScenario, seed: 7 });
    const hander = match.game.ctx.team2.players[0];
    const receiver = match.game.ctx.team2.players[1];

    const declared = await match.guest.sendCommand({
      type: "declare-action",
      playerId: hander.id,
      action: "handoff",
    });
    expect(declared.ok).toBe(true);

    // The wire command carries a target player id, never a square.
    let response = await match.guest.sendCommand({
      type: "handoff",
      playerId: hander.id,
      targetId: receiver.id,
    });
    expect(response.ok).toBe(true);
    // A Hand-off is never intercepted — the only decision it can raise is
    // the receiver's own Catch reroll, never an interception choice.
    expect(response.pendingDecision?.type).not.toBe("interception");

    // Resolve any reroll the receiving Catch offers so the ball settles.
    for (let guard = 0; response.pendingDecision && guard < 5; guard++) {
      expect(response.pendingDecision.type).toBe("reroll");
      response = await match.guest.sendCommand({
        type: "use-reroll",
        accept: false,
      });
    }

    // The host's authoritative state and the response the guest received
    // agree on where the ball landed — proxied by target id, not aimed.
    expect(response.snapshot.ballPosition).toEqual(
      match.game.snapshot().ballPosition
    );
  });

  async function findKickoffSeed(
    event: KickoffEvent,
    maxSeed = 400
  ): Promise<number> {
    for (let seed = 1; seed < maxSeed; seed++) {
      const probe = new HeadlessGame({
        scenario: kickoffInteractionScenario,
        seed,
      });
      const response = await probe.execute({
        type: "kick-ball",
        playerId: probe.ctx.team1.players[0].id,
        x: 14,
        y: 5,
      });
      const result = response.events.find(
        (e) => e.name === "kickoffResult"
      )?.data as { event?: KickoffEvent } | undefined;
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

  it("proxies a guest High Kick placement to the host and mirrors the board", async () => {
    const seed = await findKickoffSeed(KickoffEvent.HIGH_KICK);
    const match = createMatch({ scenario: kickoffInteractionScenario, seed });
    const kicked = await match.host.executeLocal({
      type: "kick-ball",
      playerId: match.game.ctx.team1.players[0].id,
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

    const receiver = match.game.ctx.team2.players.find(
      (player) =>
        player.gridPosition &&
        (player.gridPosition.x !== landing!.x ||
          player.gridPosition.y !== landing!.y)
    )!;

    const selected = await match.guest.sendCommand({
      type: "kickoff-select-player",
      playerId: receiver.id,
    });
    expect(selected.ok).toBe(true);

    const placed = await match.guest.sendCommand({
      type: "kickoff-place-player",
      playerId: receiver.id,
      x: landing!.x,
      y: landing!.y,
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

  it("keeps Solid Defence host-native and blocks the non-owning guest", async () => {
    const seed = await findKickoffSeed(KickoffEvent.SOLID_DEFENCE);
    const match = createMatch({ scenario: kickoffInteractionScenario, seed });
    const kicked = await match.host.executeLocal({
      type: "kick-ball",
      playerId: match.game.ctx.team1.players[0].id,
      x: 14,
      y: 5,
    });
    expect(kicked.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.SOLID_DEFENCE,
      chooserTeamId: match.hostTeamId,
    });

    const kicker = match.game.ctx.team1.players[0];
    const original = { ...kicker.gridPosition! };
    const occupied = new Set(
      [...match.game.ctx.team1.players, ...match.game.ctx.team2.players]
        .filter((player) => player.gridPosition)
        .map((player) => `${player.gridPosition!.x},${player.gridPosition!.y}`)
    );
    let destination: { x: number; y: number } | undefined;
    for (let x = 0; x <= 6 && !destination; x += 1) {
      for (let y = 0; y < 11; y += 1) {
        if (!occupied.has(`${x},${y}`)) {
          destination = { x, y };
          break;
        }
      }
    }
    expect(destination).toBeDefined();

    // The guest does not own this decision — its attempt to redeploy the
    // kicking team's player must be rejected without mutating state.
    const denied = await match.guest.sendCommand({
      type: "kickoff-place-player",
      playerId: kicker.id,
      x: destination!.x,
      y: destination!.y,
    });
    expect(denied.ok).toBe(false);
    expect(denied.reason).toBe("not-your-decision");
    expect(kicker.gridPosition).toEqual(original);

    const placed = await match.host.executeLocal({
      type: "kickoff-place-player",
      playerId: kicker.id,
      x: destination!.x,
      y: destination!.y,
    });
    expect(placed.ok).toBe(true);
    expect(kicker.gridPosition).toEqual(destination);

    await match.host.executeLocal({ type: "kickoff-confirm" });
    expect(match.broadcasts.length).toBeGreaterThan(0);
  });

  it("keeps Charge! host-native and blocks the non-owning guest's activation", async () => {
    const seed = await findKickoffSeed(KickoffEvent.CHARGE);
    const match = createMatch({ scenario: kickoffInteractionScenario, seed });
    const kicked = await match.host.executeLocal({
      type: "kick-ball",
      playerId: match.game.ctx.team1.players[0].id,
      x: 14,
      y: 5,
    });
    expect(kicked.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.CHARGE,
      chooserTeamId: match.hostTeamId,
    });

    const chargers = match.game.ctx.team1.players.slice(0, 2);
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
    expect(confirmed.pendingDecision).toMatchObject({
      type: "kickoff-event",
      charge: { activePlayerId: chargers[0].id },
    });

    // The kicking (host) team owns every Charge activation — the guest may
    // not act in its place even by naming one of the host's own players.
    const deniedDeclare = await match.guest.sendCommand({
      type: "declare-action",
      playerId: chargers[0].id,
      action: "move",
    });
    expect(deniedDeclare.ok).toBe(false);
    expect(deniedDeclare.reason).toBe("not-your-decision");

    const declared = await match.host.executeLocal({
      type: "declare-action",
      playerId: chargers[0].id,
      action: "move",
    });
    expect(declared.ok).toBe(true);
    const ended = await match.host.executeLocal({
      type: "end-activation",
      playerId: chargers[0].id,
    });
    expect(ended.pendingDecision).toMatchObject({
      type: "kickoff-event",
      charge: { activePlayerId: chargers[1].id },
    });
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
    // The guest spectated the host's play via broadcasts
    expect(match.broadcasts.length).toBeGreaterThan(0);
    // Nothing forced a resync during a clean match
    expect(match.resyncs).toBe(0);
  }, 60_000);

  it("rejects an out-of-turn guest command without changing state", async () => {
    const match = createMatch({ seed: 7, startingPhase: GamePhase.SETUP });
    await match.host.executeLocal({ type: "coin-flip" });

    const before = JSON.stringify(match.game.snapshot());
    // Guest tries to end the turn during setup it doesn't control
    const response = await match.guest.sendCommand({ type: "end-turn" });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe("not-your-turn");
    expect(JSON.stringify(match.game.snapshot())).toBe(before);
  });

  it("rejects guest commands that reference the host's players", async () => {
    const match = createMatch({ seed: 7, startingPhase: GamePhase.SETUP });
    // Make the GUEST the active setup team, so the rejection is specifically
    // about ownership (not turn): a coach may set up, but only their own
    // players — never reach across and place the opponent's.
    await match.host.executeLocal({
      type: "start-setup",
      kickingTeamId: match.guestTeamId,
    });

    const hostPlayer = match.game.ctx.team1.players[0];
    const response = await match.guest.sendCommand({
      type: "place-player",
      playerId: hostPlayer.id,
      x: 5,
      y: 5,
    });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe("not-your-player");
  });

  it("rejects a forged special-attack command from the non-owner without mutation", async () => {
    const forgedScenario: Scenario = {
      ...uphillScenario,
      id: "forged-special-owner",
      setup: {
        ...uphillScenario.setup,
        activeTeam: "team2",
        team1Placements: [
          {
            playerIndex: 0,
            x: 10,
            y: 5,
            skills: [SkillType.STAB],
          },
        ],
      },
    };
    const match = createMatch({ scenario: forgedScenario, seed: 9 });
    const hostAttacker = match.game.ctx.team1.players[0];
    const guestTarget = match.game.ctx.team2.players[0];
    const before = JSON.stringify(match.game.snapshot());

    const response = await match.guest.sendCommand({
      type: "stab",
      attackerId: hostAttacker.id,
      defenderId: guestTarget.id,
    });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe("not-your-player");
    expect(JSON.stringify(match.game.snapshot())).toBe(before);
  });

  it("rejects setup placement when it is not that coach's setup turn", async () => {
    const match = createMatch({ seed: 7, startingPhase: GamePhase.SETUP });
    // Host is the kicking team and sets up first; the guest must wait.
    await match.host.executeLocal({
      type: "start-setup",
      kickingTeamId: match.hostTeamId,
    });

    const guestPlayer = match.game.ctx.team2.players[0];
    const response = await match.guest.sendCommand({
      type: "place-player",
      playerId: guestPlayer.id,
      x: 20,
      y: 5,
    });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe("not-your-turn");
  });

  it("gives a guest the same named setup restriction as local/headless play", async () => {
    const match = createMatch({ seed: 8, startingPhase: GamePhase.SETUP });
    await match.host.executeLocal({
      type: "start-setup",
      kickingTeamId: match.guestTeamId,
    });
    const [first, second] = match.game.ctx.team2.players;

    expect(
      (
        await match.guest.sendCommand({
          type: "place-player",
          playerId: first.id,
          x: 14,
          y: 0,
        })
      ).ok
    ).toBe(true);
    const response = await match.guest.sendCommand({
      type: "place-player",
      playerId: second.id,
      x: 14,
      y: 1,
    });

    expect(response.ok).toBe(false);
    expect(response.reason).toContain(
      "Only one player may be set up in each Wide Zone."
    );
  });

  it("kickoff belongs to the kicking (non-active) team, not the active team", () => {
    // During KICKOFF, active = receiving team; the kicking team acts.
    const ctx = {
      activeTeamId: "receiving",
      pendingDecision: null,
      teamIdOfPlayer: (id: string) =>
        id.startsWith("kick") ? "kicking" : "receiving",
      hostTeamId: "kicking",
      phase: GamePhase.KICKOFF,
    };

    // Kicking team (non-active) may select its kicker and kick
    expect(
      checkOwnership(
        { type: "select-kicker", playerId: "kick-1" },
        "kicking",
        ctx
      ).allowed
    ).toBe(true);
    expect(
      checkOwnership(
        { type: "kick-ball", playerId: "kick-1", x: 5, y: 5 },
        "kicking",
        ctx
      ).allowed
    ).toBe(true);

    // Receiving team (active) may NOT kick off
    const denied = checkOwnership(
      { type: "select-kicker", playerId: "recv-1" },
      "receiving",
      ctx
    );
    expect(denied.allowed).toBe(false);
  });

  it("post-match SPP choices are limited to the coach's own team", () => {
    const ctx = {
      activeTeamId: "team-1",
      pendingDecision: null,
      teamIdOfPlayer: (id: string) =>
        id.startsWith("one") ? "team-1" : "team-2",
      hostTeamId: "team-1",
      phase: GamePhase.GAME_OVER,
    };

    expect(
      checkOwnership(
        {
          type: "award-mvp",
          teamId: "team-1",
          nominatedPlayerIds: ["one-1"],
        },
        "team-1",
        ctx
      ).allowed
    ).toBe(true);
    expect(
      checkOwnership(
        {
          type: "award-mvp",
          teamId: "team-2",
          nominatedPlayerIds: ["two-1"],
        },
        "team-1",
        ctx
      ).allowed
    ).toBe(false);
    expect(
      checkOwnership(
        { type: "assign-awarded-touchdown", playerId: "two-1" },
        "team-1",
        ctx
      ).allowed
    ).toBe(false);
  });

  it("uphill block dice: only the defender may choose", async () => {
    const match = createMatch({ scenario: uphillScenario, seed: 11 });
    const attacker = match.game.ctx.team1.players[0];
    const defender = match.game.ctx.team2.players[0];

    await match.host.executeLocal({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    await match.host.executeLocal({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });

    const pending = match.game.pendingDecision();
    expect(pending?.type).toBe("block-dice");
    if (pending?.type !== "block-dice") return;
    expect(pending.chooserTeamId).toBe(match.guestTeamId);

    // The attacking host may not take the defender's decision
    const hostAttempt = await match.host.executeLocal({
      type: "choose-block-result",
      index: 0,
    });
    expect(hostAttempt.ok).toBe(false);
    expect(hostAttempt.reason).toBe("not-your-decision");

    // The defending guest may
    const guestAttempt = await match.guest.sendCommand({
      type: "choose-block-result",
      index: 0,
    });
    expect(guestAttempt.ok).toBe(true);
  });

  it("a reroll decision is accepted only from the rolling coach's session", async () => {
    // The GUEST's mover fails a pickup with team rerolls banked: the offer
    // belongs to the guest, and the host may not answer it.
    const guestPickup: Scenario = {
      id: "guest-pickup",
      name: "Guest pickup",
      description: "guest mover picks up with rerolls banked",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 18, y: 8 }],
        team2Placements: [{ playerIndex: 0, x: 4, y: 5 }],
        activeTeam: "team2",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 5, y: 5 },
      },
    };

    for (let seed = 1; seed <= 100; seed++) {
      const match = createMatch({ scenario: guestPickup, seed });
      match.game.ctx.team2.rerolls = 3;
      const mover = match.game.ctx.team2.players[0];

      await match.guest.sendCommand({
        type: "declare-action",
        playerId: mover.id,
        action: "move",
      });
      await match.guest.sendCommand({
        type: "move",
        playerId: mover.id,
        path: [{ x: 5, y: 5 }],
      });

      const pending = match.game.pendingDecision();
      if (pending?.type !== "reroll") continue; // pickup succeeded
      expect(pending.chooserTeamId).toBe(match.guestTeamId);

      // The host may not spend the guest's reroll decision
      const hostAttempt = await match.host.executeLocal({
        type: "use-reroll",
        accept: true,
      });
      expect(hostAttempt.ok).toBe(false);
      expect(hostAttempt.reason).toBe("not-your-decision");
      expect(match.game.pendingDecision()?.type).toBe("reroll");

      // The guest may
      const guestAttempt = await match.guest.sendCommand({
        type: "use-reroll",
        accept: true,
        source: "team",
      });
      expect(guestAttempt.ok).toBe(true);
      expect(match.game.ctx.team2.rerolls).toBe(2);
      return;
    }
    throw new Error("no failing pickup found in seed range");
  });

  it("a reaction decision belongs to the REACTING coach, not the actor", async () => {
    // Host blocks the guest's Stand Firm defender: the push refusal is the
    // guest's decision even though the host is the acting side.
    const standFirmScenario: Scenario = {
      id: "standfirm-online",
      name: "Stand Firm online",
      description: "host blocks a guest defender who has Stand Firm",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
        team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    };

    for (let seed = 1; seed <= 60; seed++) {
      const match = createMatch({ scenario: standFirmScenario, seed });
      const attacker = match.game.ctx.team1.players[0];
      const defender = match.game.ctx.team2.players[0];
      defender.skills.push({
        type: SkillType.STAND_FIRM,
        category: SkillCategory.GENERAL,
        description: "",
      });

      await match.host.executeLocal({
        type: "declare-action",
        playerId: attacker.id,
        action: "block",
      });
      await match.host.executeLocal({
        type: "block",
        attackerId: attacker.id,
        defenderId: defender.id,
      });

      const dice = match.game.pendingDecision();
      if (dice?.type !== "block-dice") continue;
      const pushIndex = dice.options.findIndex((o) =>
        ["push", "pow", "pow-dodge"].includes(o.type)
      );
      if (pushIndex < 0) continue; // no push rolled — next seed

      await match.host.executeLocal({
        type: "choose-block-result",
        index: pushIndex,
      });

      const pending = match.game.pendingDecision();
      expect(pending?.type).toBe("reaction");
      if (pending?.type !== "reaction") return;
      expect(pending.chooserTeamId).toBe(match.guestTeamId);
      expect(pending.skill).toBe(SkillType.STAND_FIRM);

      // The acting host may not answer the guest's reaction
      const hostAttempt = await match.host.executeLocal({
        type: "use-reaction",
        accept: false,
      });
      expect(hostAttempt.ok).toBe(false);
      expect(hostAttempt.reason).toBe("not-your-decision");

      // The reacting guest may — refusing the push keeps them in place
      const guestAttempt = await match.guest.sendCommand({
        type: "use-reaction",
        accept: true,
      });
      expect(guestAttempt.ok).toBe(true);
      expect(defender.gridPosition).toEqual({ x: 11, y: 5 });
      return;
    }
    throw new Error("no push result rolled in seed range");
  });

  it("drops duplicates and requests a resync on a sequence gap", async () => {
    const game = new HeadlessGame({ seed: 3, startingPhase: GamePhase.SETUP });
    const chats: string[] = [];
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    let resyncs = 0;
    const host = new HostSession({
      transport: hostEnd,
      game,
      hostTeamId: game.ctx.team1.id,
      guestTeamId: game.ctx.team2.id,
      selfId: "host-uid",
    });
    const guest = new GuestSession({
      transport: guestEnd,
      selfId: "guest-uid",
      onChat: (payload) => chats.push(payload.text),
      onResync: () => resyncs++,
    });

    // In-order chat arrives once, its duplicate is dropped
    const chat: Envelope = {
      kind: "chat",
      payload: { text: "hello", senderName: "Host" },
      seq: 1,
      from: "host-uid",
      ts: Date.now(),
    };
    await hostEnd.send(chat);
    await hostEnd.send(chat);
    expect(chats).toEqual(["hello"]);

    // A gap (seq jumps 2 → 9) triggers a resync request, host answers it
    await hostEnd.send({
      ...chat,
      payload: { ...chat.payload, text: "gap" },
      seq: 9,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(chats).toEqual(["hello", "gap"]); // gapped envelope still newest, applied
    expect(resyncs).toBe(1); // and the view was rebuilt from a snapshot

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
    // routing `run()`/`senderSide()` use elsewhere in this file) so the
    // ownership gate doesn't reject an out-of-turn call.
    game.ctx.gameService.startGame(hostTeamId);
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
});
