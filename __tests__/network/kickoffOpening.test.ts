/**
 * The opening sequence through every Sevens kick-off event, to the first
 * normal turn: the kick, the event, any step the event opens, then the
 * receiving coach moves a player. Played on one engine, as hotseat and the
 * sandbox play it, and on two engines in lockstep, as an online match
 * plays it with each command sent by the coach who owns it.
 *
 * Live site, protocol 8: after Charge! a coach could move nobody.
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  CommandResponse,
  HeadlessCommand,
  PendingDecision,
} from "../../src/headless/protocol";
import { stateChecksum } from "../../src/headless/checksum";
import { LockstepSession } from "../../src/network/LockstepSession";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { decisionOwner } from "../../src/network/OwnershipGate";
import {
  KICKOFF_TABLE,
  KickoffEvent,
} from "../../src/game/kickoff/kickoffEvents";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { Scenario } from "../../src/types/Scenario";

const scenario: Scenario = {
  id: "opening-kickoff",
  name: "Opening kick-off",
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

const kick = (game: HeadlessGame): HeadlessCommand => ({
  type: "kick-ball",
  playerId: game.ctx.team1.players[0].id,
  x: 14,
  y: 5,
});

/** A seed whose kick-off rolls this event. */
async function seedFor(event: KickoffEvent): Promise<number> {
  for (let seed = 1; seed < 800; seed++) {
    const probe = new HeadlessGame({ scenario, seed });
    const response = await probe.execute(kick(probe));
    const rolled = response.events.find((e) => e.name === "kickoffResult")
      ?.data as { event?: KickoffEvent } | undefined;
    if (rolled?.event === event) return seed;
  }
  throw new Error(`no seed rolls ${event}`);
}

/** Runs a command as the coach of the given team. */
type Play = (
  team: string,
  command: HeadlessCommand
) => Promise<CommandResponse>;

interface Table {
  /** The board both coaches read; online, the host's engine. */
  game: HeadlessGame;
  play: Play;
  /** Every engine in the match agrees on the board. */
  agreed(): void;
}

function hotseat(seed: number): Table {
  const game = new HeadlessGame({ scenario, seed });
  return {
    game,
    play: (_team, command) => game.execute(command),
    agreed: () => {},
  };
}

function online(seed: number): Table {
  const game = new HeadlessGame({ scenario, seed });
  const guestGame = new HeadlessGame({
    scenario,
    seed,
    team1: structuredClone(game.ctx.team1),
    team2: structuredClone(game.ctx.team2),
  });
  const [hostEnd, guestEnd] = createInMemoryTransportPair();
  const hostTeamId = game.ctx.team1.id;
  const guestTeamId = game.ctx.team2.id;
  let resyncs = 0;
  const session = (
    engine: HeadlessGame,
    transport: typeof hostEnd,
    mine: string,
    theirs: string
  ) =>
    new LockstepSession({
      transport,
      game: engine,
      selfId: `${mine}-uid`,
      myTeamId: mine,
      peerTeamId: theirs,
      hostTeamId,
      onResynced: () => resyncs++,
    });
  const host = session(game, hostEnd, hostTeamId, guestTeamId);
  const guest = session(guestGame, guestEnd, guestTeamId, hostTeamId);
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await host.whenIdle();
      await guest.whenIdle();
    }
  };
  return {
    game,
    play: async (team, command) => {
      const response = await (team === hostTeamId ? host : guest).run(command);
      await settle();
      return response;
    },
    agreed: () => {
      expect(stateChecksum(guestGame)).toBe(stateChecksum(game));
      expect(guestGame.pendingDecision()).toEqual(game.pendingDecision());
      expect(resyncs).toBe(0);
    },
  };
}

const ownerOf = (game: HeadlessGame, pending: PendingDecision) =>
  decisionOwner(pending, {
    activeTeamId: game.ctx.gameService.getState().activeTeamId,
    pendingDecision: pending,
    teamIdOfPlayer: (id) => game.ctx.gameService.getPlayerById(id)?.teamId,
    hostTeamId: game.ctx.team1.id,
  })!;

const isFree = (game: HeadlessGame, x: number, y: number) =>
  x >= 0 &&
  x < 20 &&
  y >= 0 &&
  y < 11 &&
  !game.ctx.gameService.getPlayerAt(x, y);

/** A Standing player of the team with a free square beside them. */
function mover(game: HeadlessGame, teamId: string, skip: string[] = []) {
  for (const player of game.ctx.gameService.getTeam(teamId)!.players) {
    const at = player.gridPosition;
    if (!at || player.status !== PlayerStatus.ACTIVE) continue;
    if (skip.includes(player.id)) continue;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      if (isFree(game, at.x + dx, at.y + dy))
        return { player, to: { x: at.x + dx, y: at.y + dy } };
    }
  }
  throw new Error("nobody can move");
}

/** Answer whatever the kick-off left open, as its coach would. */
async function resolveOpening(table: Table) {
  const { game, play } = table;
  for (let guard = 0; guard < 30; guard++) {
    const pending = game.pendingDecision();
    if (!pending) return;
    const owner = ownerOf(game, pending);
    if (pending.type === "touchback") {
      const receiver = mover(game, owner).player;
      await play(owner, { type: "touchback", playerId: receiver.id });
      continue;
    }
    if (pending.type !== "kickoff-event") {
      throw new Error(`unexpected ${pending.type} in the opening`);
    }
    if (pending.charge?.activePlayerId) {
      // Each charger takes one step, as a coach would
      const playerId = pending.charge.activePlayerId;
      const at = game.ctx.gameService.getPlayerById(playerId)!.gridPosition!;
      expect(
        (
          await play(owner, {
            type: "declare-action",
            playerId,
            action: "move",
          })
        ).ok
      ).toBe(true);
      const to = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
        .map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy }))
        .find((s) => isFree(game, s.x, s.y))!;
      expect(
        (await play(owner, { type: "move", playerId, path: [to] })).ok
      ).toBe(true);
      await play(owner, { type: "end-activation", playerId });
      continue;
    }
    switch (pending.event) {
      case KickoffEvent.CHARGE:
      case KickoffEvent.ALERT_DEFENCE:
      case KickoffEvent.QUICK_SNAP: {
        const { player, to } = mover(game, owner);
        await play(owner, {
          type: "kickoff-select-player",
          playerId: player.id,
        });
        if (pending.event !== KickoffEvent.CHARGE) {
          expect(
            (
              await play(owner, {
                type: "kickoff-move-player",
                playerId: player.id,
                ...to,
              })
            ).ok
          ).toBe(true);
        }
        await play(owner, { type: "kickoff-confirm" });
        break;
      }
      default:
        await play(owner, { type: "kickoff-skip" });
    }
  }
  throw new Error("the opening never settled");
}

const EVENTS = [...new Set(Object.values(KICKOFF_TABLE))];

describe.each([
  ["hotseat", hotseat],
  ["online lockstep", online],
] as const)("the opening on %s", (_mode, build) => {
  it.each(EVENTS)(
    "%s resolves and the receiving coach moves a player",
    async (event) => {
      const table = build(await seedFor(event));
      const { game, play } = table;
      const kicked = await play(game.ctx.team1.id, kick(game));
      expect(kicked.ok).toBe(true);
      await resolveOpening(table);
      table.agreed();

      expect(game.pendingDecision()).toBeNull();
      expect(game.snapshot()).toMatchObject({
        phase: GamePhase.PLAY,
        activeTeamId: game.ctx.team2.id,
      });
      const { player, to } = mover(game, game.ctx.team2.id);
      expect(
        (
          await play(game.ctx.team2.id, {
            type: "declare-action",
            playerId: player.id,
            action: "move",
          })
        ).ok
      ).toBe(true);
      const moved = await play(game.ctx.team2.id, {
        type: "move",
        playerId: player.id,
        path: [to],
      });
      expect(moved.ok, moved.reason).toBe(true);
      expect(
        game.ctx.gameService.getPlayerById(player.id)!.gridPosition
      ).toEqual(to);
      table.agreed();
    }
  );
});
