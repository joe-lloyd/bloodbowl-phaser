import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  type HeadlessCommand,
  type CommandResponse,
  type PendingDecision,
} from "../../src/headless/protocol";
import { type GameSnapshot } from "../../src/headless/serialization";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { type Scenario } from "../../src/types/Scenario";
import { LockstepSession } from "../../src/network/LockstepSession";
import {
  createInMemoryTransportPair,
  type Transport,
} from "../../src/network/transport";
import { decisionOwner } from "../../src/network/OwnershipGate";

export interface Side {
  executeLocal(command: HeadlessCommand): Promise<CommandResponse>;
  sendCommand(command: HeadlessCommand): Promise<CommandResponse>;
  close(): void;
}

export interface Match {
  game: HeadlessGame;
  guestGame: HeadlessGame;
  host: Side;
  guest: Side;
  hostTeamId: string;
  guestTeamId: string;

  broadcasts: HeadlessCommand[];
  resyncs: number;
}

export function createMatch(
  options: ConstructorParameters<typeof HeadlessGame>[0]
) {
  const game = new HeadlessGame(options);

  const guestGame = new HeadlessGame({
    ...options,
    team1: structuredClone(game.ctx.team1),
    team2: structuredClone(game.ctx.team2),
  });
  const hostTeamId = game.ctx.team1.id;
  const guestTeamId = game.ctx.team2.id;
  const [hostEnd, guestEnd] = createInMemoryTransportPair();
  const match: Match = {
    game,
    guestGame,
    hostTeamId,
    guestTeamId,
    broadcasts: [],
    resyncs: 0,
    host: null as unknown as Side,
    guest: null as unknown as Side,
  };
  const session = (
    engine: HeadlessGame,
    transport: Transport,
    mine: string,
    theirs: string,
    selfId: string
  ) =>
    new LockstepSession({
      transport,
      game: engine,
      selfId,
      myTeamId: mine,
      peerTeamId: theirs,
      hostTeamId,
      onResynced: () => match.resyncs++,
    });
  const hostSession = session(
    game,
    hostEnd,
    hostTeamId,
    guestTeamId,
    "host-uid"
  );
  const guestSession = session(
    guestGame,
    guestEnd,
    guestTeamId,
    hostTeamId,
    "guest-uid"
  );
  const settled = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await hostSession.whenIdle();
      await guestSession.whenIdle();
    }
  };
  const side = (own: LockstepSession, isHost: boolean): Side => {
    const run = async (command: HeadlessCommand) => {
      const response = await own.run(command);
      if (isHost && response.ok) match.broadcasts.push(command);
      await settled();

      return {
        ...response,
        snapshot: game.snapshot(),
        pendingDecision: game.pendingDecision(),
      };
    };
    return {
      executeLocal: run,
      sendCommand: run,
      close: () => {
        own.close();
      },
    };
  };
  match.host = side(hostSession, true);
  match.guest = side(guestSession, false);
  return match;
}

export function senderSide(
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

export async function run(
  match: Match,
  command: HeadlessCommand
): Promise<CommandResponse> {
  const pending = match.game.pendingDecision();

  if (command.type === "state" || command.type === "legal-actions") {
    return match.host.executeLocal(command);
  }
  return senderSide(match, command, pending) === "guest"
    ? match.guest.sendCommand(command)
    : match.host.executeLocal(command);
}

export async function playNetworkedMatch(seed: number): Promise<{
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
        await exec({ type: "choose-push-direction", x: fixtureValue(dir).x, y: fixtureValue(dir).y });
      } else if (pending.type === "touchback") {
        const receiver = fixtureValue(fixtureValue(snap.teams
          .find((t) => t.id === pending.teamId))
          .players.find((p) => p.position && p.status === "Active"));
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
        const teamId = fixtureValue(snap.activeTeamId);
        await placeTeam(match, exec, snap, teamId);
        await exec({ type: "confirm-setup", teamId });
      } else {
        await exec({ type: "coin-flip" });
      }
      continue;
    }

    if (snap.phase === GamePhase.KICKOFF) {
      const kickerTeam = fixtureValue(snap.teams.find((t) => t.id === kickingTeamId));
      const kicker = fixtureValue(kickerTeam.players.find((p) => p.position));
      const isTeam1 = kickerTeam.id === fixtureValue(snap.teams[0]).id;
      const target = isTeam1 ? { x: 15, y: 5 } : { x: 4, y: 5 };
      const kicked = await exec({
        type: "kick-ball",
        playerId: kicker.id,
        x: target.x,
        y: target.y,
      });
      if (!kicked.ok) throw new Error(`kick failed: ${String(kicked.reason)}`);
      continue;
    }

    if (snap.phase === GamePhase.PLAY) {
      const legal = await exec({ type: "legal-actions" });
      const candidates = fixtureValue(legal.legalActions).players.filter((p) =>
        p.actions.includes("move")
      );
      if (candidates.length === 0) {
        await exec({ type: "end-turn" });
        continue;
      }

      const actor = candidates[0];
      const detailed = await exec({
        type: "legal-actions",
        playerId: fixtureValue(actor).playerId,
      });
      const targets =
        fixtureValue(detailed.legalActions).players.find(
          (p) => p.playerId === fixtureValue(actor).playerId
        )?.moveTargets ?? [];

      const me = fixtureValue(snap.teams
        .flatMap((t) => t.players)
        .find((p) => p.id === fixtureValue(actor).playerId));
      const goalRight = me.teamId === fixtureValue(snap.teams[0]).id;
      const adjacent = targets
        .filter(
          (t) =>
            Math.abs(t.x - fixtureValue(me.position).x) <= 1 &&
            Math.abs(t.y - fixtureValue(me.position).y) <= 1
        )
        .sort((a, b) => (goalRight ? b.x - a.x : a.x - b.x));

      if (adjacent.length === 0) {
        await exec({ type: "end-activation", playerId: fixtureValue(actor).playerId });
        await exec({ type: "end-turn" });
        continue;
      }

      await exec({
        type: "declare-action",
        playerId: fixtureValue(actor).playerId,
        action: "move",
      });
      await exec({
        type: "move",
        playerId: fixtureValue(actor).playerId,
        path: [fixtureValue(adjacent[0])],
      });
      await exec({ type: "end-activation", playerId: fixtureValue(actor).playerId });
      await exec({ type: "end-turn" });
      continue;
    }

    throw new Error(
      `Bot stuck in phase ${snap.phase}/${String(snap.subPhase)}`
    );
  }

  return { match, finalSnapshot: game.snapshot(), commandCount };
}

export async function placeTeam(
  match: Match,
  exec: (cmd: HeadlessCommand) => Promise<CommandResponse>,
  snap: GameSnapshot,
  teamId: string
): Promise<void> {
  const zone = fixtureValue(match.game.ctx.gameService.getSetupZone(teamId));
  const team = fixtureValue(snap.teams.find((t) => t.id === teamId));
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
      .map((p) => `${String(fixtureValue(p.position).x)},${String(fixtureValue(p.position).y)}`)
  );

  const lineX = teamId === fixtureValue(snap.teams[0]).id ? zone.maxX : zone.minX;
  let placed = 0;
  outer: for (
    let x = lineX;
    x >= zone.minX && x <= zone.maxX;
    x += teamId === fixtureValue(snap.teams[0]).id ? -1 : 1
  ) {
    for (let y = 2; y <= 8; y++) {
      if (placed >= toPlace.length) break outer;
      if (occupied.has(`${String(x)},${String(y)}`)) continue;
      const player = toPlace[placed];
      const response = await exec({
        type: "place-player",
        playerId: fixtureValue(player).id,
        x,
        y,
      });
      if (response.ok) {
        occupied.add(`${String(x)},${String(y)}`);
        placed++;
      }
    }
  }
}

export const uphillScenario: Scenario = {
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

export const handoffScenario: Scenario = {
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

export const bloodlustDesyncScenario: Scenario = {
  id: "online-bloodlust-desync",
  name: "Online Bloodlust desync",
  description:
    "Guest's Bloodlust-skilled player commits via the activation gate; a stale cancel/redeclare that follows must not desync host state.",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 18, y: 8 }],
    team2Placements: [
      { playerIndex: 0, x: 4, y: 5, skills: [SkillType.BLOODLUST] },
    ],
    activeTeam: "team2",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

export const kickoffInteractionScenario: Scenario = {
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
