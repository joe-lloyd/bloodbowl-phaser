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
      if (pending.type === "block-dice") {
        await exec({ type: "choose-block-result", index: 0 });
      } else if (pending.type === "push-direction") {
        const dir = pending.options[0];
        await exec({ type: "choose-push-direction", x: dir.x, y: dir.y });
      } else if (pending.type === "touchback") {
        const receiver = snap.teams
          .find((t) => t.id === pending.teamId)!
          .players.find((p) => p.position && p.status === "Active")!;
        await exec({ type: "touchback", playerId: receiver.id });
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

describe("networked sessions", () => {
  it("plays a complete match with every command crossing the wire", async () => {
    const { match, finalSnapshot, commandCount } =
      await playNetworkedMatch(2025);

    expect(finalSnapshot.phase).toBe(GamePhase.GAME_OVER);
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
    await hostEnd.send({ ...chat, payload: { ...chat.payload, text: "gap" }, seq: 9 });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(chats).toEqual(["hello", "gap"]); // gapped envelope still newest, applied
    expect(resyncs).toBe(1); // and the view was rebuilt from a snapshot

    host.close();
    guest.close();
  });
});
