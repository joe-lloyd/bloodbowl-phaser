import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";
import { GameSnapshot } from "../../src/headless/serialization";

/**
 * Minimal deterministic match bot: places players, kicks off, moves one
 * player per turn, answers every pendingDecision with its first option —
 * and always DECLINES reroll/reaction offers. Exists to prove a complete
 * match runs headless — not to play well.
 */
async function playFullMatch(seed: number): Promise<{
  finalSnapshot: GameSnapshot;
  commandCount: number;
  sawHalftime: boolean;
  skillDecisions: number;
}> {
  const game = new HeadlessGame({ seed, startingPhase: GamePhase.SETUP });
  // Bank team rerolls so failed rolls raise real reroll decisions mid-match
  game.ctx.team1.rerolls = 3;
  game.ctx.team2.rerolls = 3;
  const gs = game.ctx.gameService;
  let commandCount = 0;
  let sawHalftime = false;
  let kickingTeamId: string | null = null;
  let driveCount = 0;
  let skillDecisions = 0;

  const run = async (command: unknown) => {
    commandCount++;
    return game.execute(command);
  };

  const MAX_COMMANDS = 600;
  while (commandCount < MAX_COMMANDS) {
    const snap = game.snapshot();
    if (snap.phase === GamePhase.GAME_OVER) break;
    if (snap.turn.isHalf2) sawHalftime = true;

    const pending = game.pendingDecision();
    if (pending) {
      if (pending.type === "kickoff-event") {
        await run({ type: "kickoff-skip" });
      } else if (pending.type === "block-dice") {
        await run({ type: "choose-block-result", index: 0 });
      } else if (pending.type === "push-direction") {
        const dir = pending.options[0];
        await run({ type: "choose-push-direction", x: dir.x, y: dir.y });
      } else if (pending.type === "touchback") {
        const receiver = snap.teams
          .find((t) => t.id === pending.teamId)!
          .players.find((p) => p.position && p.status === "Active")!;
        await run({ type: "touchback", playerId: receiver.id });
      } else if (pending.type === "reroll") {
        skillDecisions++;
        await run({ type: "use-reroll", accept: false });
      } else if (pending.type === "reaction") {
        skillDecisions++;
        await run({ type: "use-reaction", accept: false });
      } else {
        await run({ type: "choose-follow-up", followUp: true });
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
          driveCount++;
          if (driveCount > 1) {
            // Drive reset must have cleared the pitch and the ball,
            // and later drives never re-run the coin flip
            const everyone = snap.teams.flatMap((t) => t.players);
            expect(everyone.every((p) => p.position === null)).toBe(true);
            expect(snap.ballPosition).toBeNull();
            const flip = await run({ type: "coin-flip" });
            expect(flip.ok).toBe(false);
          }
        }
        const teamId = snap.activeTeamId!;
        await placeTeam(game, run, snap, teamId);
        await run({ type: "confirm-setup", teamId });
      } else {
        await run({ type: "coin-flip" });
      }
      continue;
    }

    if (snap.phase === GamePhase.KICKOFF) {
      const kickerTeam = snap.teams.find((t) => t.id === kickingTeamId)!;
      const kicker = kickerTeam.players.find((p) => p.position)!;
      const isTeam1 = kickerTeam.id === snap.teams[0].id;
      const target = isTeam1 ? { x: 15, y: 5 } : { x: 4, y: 5 };
      const kicked = await run({
        type: "kick-ball",
        playerId: kicker.id,
        x: target.x,
        y: target.y,
      });
      if (!kicked.ok) throw new Error(`kick failed: ${kicked.reason}`);
      continue;
    }

    if (snap.phase === GamePhase.PLAY) {
      const legal = await run({ type: "legal-actions" });
      const candidates = legal.legalActions!.players.filter((p) =>
        p.actions.includes("move")
      );
      if (candidates.length === 0) {
        await run({ type: "end-turn" });
        continue;
      }

      const actor = candidates[0];
      const detailed = await run({
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
        await run({ type: "end-activation", playerId: actor.playerId });
        await run({ type: "end-turn" });
        continue;
      }

      await run({
        type: "declare-action",
        playerId: actor.playerId,
        action: "move",
      });
      await run({
        type: "move",
        playerId: actor.playerId,
        path: [adjacent[0]],
      });
      await run({ type: "end-activation", playerId: actor.playerId });
      await run({ type: "end-turn" });
      continue;
    }

    // Transient phases (TOUCHDOWN/HALFTIME) settle inside commands; if we
    // observe one here something is stuck.
    throw new Error(`Bot stuck in phase ${snap.phase}/${snap.subPhase}`);
  }

  expect(gs.getState().phase).toBe(GamePhase.GAME_OVER);
  return {
    finalSnapshot: game.snapshot(),
    commandCount,
    sawHalftime,
    skillDecisions,
  };
}

async function placeTeam(
  game: HeadlessGame,
  run: (cmd: unknown) => Promise<{ ok: boolean; reason?: string }>,
  snap: GameSnapshot,
  teamId: string
): Promise<void> {
  const zone = game.ctx.gameService.getSetupZone(teamId)!;
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
      const response = await run({
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

describe("full headless match", () => {
  it("plays a complete seeded match to GAME_OVER", async () => {
    const { finalSnapshot, commandCount, sawHalftime } =
      await playFullMatch(2025);

    expect(finalSnapshot.phase).toBe(GamePhase.GAME_OVER);
    expect(sawHalftime).toBe(true); // both halves were played
    expect(Object.keys(finalSnapshot.score)).toHaveLength(2);
    expect(commandCount).toBeLessThan(600);
    // A normally completed match records its termination reason distinctly
    // from a concession/forfeit, alongside the (untouched) played score.
    expect(finalSnapshot.result).toEqual({ reason: "completed" });
  }, 60_000);

  it("the bot answers reroll/reaction decisions when a match raises them", async () => {
    // Not every seed fails an eligible roll; scan a few full matches until
    // one offers a reroll — the bot declines and the match still completes.
    for (let seed = 1; seed <= 12; seed++) {
      const { finalSnapshot, skillDecisions } = await playFullMatch(seed);
      expect(finalSnapshot.phase).toBe(GamePhase.GAME_OVER);
      if (skillDecisions > 0) return;
    }
    throw new Error("no seed raised a skill decision in a full match");
  }, 120_000);

  it("is deterministic: same seed twice gives the same final state", async () => {
    const a = await playFullMatch(31337);
    const b = await playFullMatch(31337);
    // Team ids embed a creation timestamp, so compare scores by team order
    const scoresInOrder = (snap: GameSnapshot) =>
      snap.teams.map((t) => snap.score[t.id]);
    expect(scoresInOrder(a.finalSnapshot)).toEqual(
      scoresInOrder(b.finalSnapshot)
    );
    expect(a.commandCount).toBe(b.commandCount);
  }, 120_000);

  it("scores a touchdown and resets for the next drive", async () => {
    // Carrier two squares from the end zone walks it in.
    const scenario: Scenario = {
      id: "td-test",
      name: "TD test",
      description: "carrier walks into the end zone",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 17, y: 5 }],
        team2Placements: [{ playerIndex: 0, x: 13, y: 9 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 17, y: 5 },
      },
    };

    const game = new HeadlessGame({ scenario, seed: 5 });
    const carrier = game.snapshot().teams[0].players[0];

    await game.execute({
      type: "declare-action",
      playerId: carrier.id,
      action: "move",
    });
    const response = await game.execute({
      type: "move",
      playerId: carrier.id,
      path: [
        { x: 18, y: 5 },
        { x: 19, y: 5 },
      ],
    });

    expect(response.ok).toBe(true);
    expect(
      response.events.some((e) => e.name === GameEventNames.Touchdown)
    ).toBe(true);
    expect(response.snapshot.score[game.snapshot().teams[0].id]).toBe(1);
    // Post-drive sequence lands back in SETUP for the next kickoff
    expect(response.snapshot.phase).toBe(GamePhase.SETUP);
  });
});
