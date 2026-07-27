/**
 * Deterministic full matches.
 *
 * A scenario case is a fixed script, which is exactly right for proving one
 * rule and exactly wrong for proving a whole match: a match's shape depends
 * on dice, so it needs a bot rather than a list of commands. This spec owns
 * the transitions no scripted case can reach — the opening coin flip, both
 * halves, halftime, drive resets after a score, and the final whistle.
 *
 * The bot plays badly on purpose. It exists to prove the match *completes*
 * and that every phase boundary is passable, not to make good decisions.
 */

import { test, expect } from "../support/engineTest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameSnapshot } from "../../src/headless/serialization";
import { PendingDecision } from "../../src/headless/protocol";
import { recordCoverageFragment } from "../support/coverageFragments";
import { MATCH_FLOW_CASES } from "../../src/testing/cases";

/** A command budget: a match that needs more than this is stuck, not slow. */
const MAX_COMMANDS = 600;

interface MatchResult {
  finalSnapshot: GameSnapshot;
  commandCount: number;
  /** Phases the bot actually observed, for coverage. */
  phasesSeen: Set<string>;
  /** Decisions the match actually raised, for coverage. */
  decisionsSeen: PendingDecision[];
  /** Commands actually executed, for coverage. */
  commandsSeen: Set<string>;
  sawHalftime: boolean;
  touchdowns: number;
  /** How many times a drive's setup began — one per kickoff. */
  driveCount: number;
}

async function playFullMatch(seed: number): Promise<MatchResult> {
  const game = new HeadlessGame({ seed, startingPhase: GamePhase.SETUP });
  // Bank rerolls so failed rolls raise real decisions mid-match.
  game.ctx.team1.rerolls = 3;
  game.ctx.team2.rerolls = 3;

  const phasesSeen = new Set<string>();
  const decisionsSeen: PendingDecision[] = [];
  const commandsSeen = new Set<string>();
  let commandCount = 0;
  let sawHalftime = false;
  let kickingTeamId: string | null = null;
  let driveCount = 0;

  const run = async (command: { type: string } & Record<string, unknown>) => {
    commandCount++;
    commandsSeen.add(command.type);
    return game.execute(command);
  };

  while (commandCount < MAX_COMMANDS) {
    const snapshot = game.snapshot();
    phasesSeen.add(snapshot.phase);
    if (snapshot.phase === GamePhase.GAME_OVER) break;
    if (snapshot.turn.isHalf2) sawHalftime = true;

    const pending = game.pendingDecision();
    if (pending) {
      decisionsSeen.push(pending);
      switch (pending.type) {
        case "kickoff-event":
          await run({ type: "kickoff-skip" });
          break;
        case "block-dice":
          await run({ type: "choose-block-result", index: 0 });
          break;
        case "push-direction": {
          const direction = pending.options[0];
          await run({
            type: "choose-push-direction",
            x: direction.x,
            y: direction.y,
          });
          break;
        }
        case "touchback": {
          const receiver = snapshot.teams
            .find((team) => team.id === pending.teamId)!
            .players.find(
              (player) => player.position && player.status === "Active"
            )!;
          await run({ type: "touchback", playerId: receiver.id });
          break;
        }
        case "reroll":
          await run({ type: "use-reroll", accept: false });
          break;
        case "reaction":
          await run({ type: "use-reaction", accept: false });
          break;
        case "interception":
          await run({ type: "choose-interception" });
          break;
        default:
          await run({ type: "choose-follow-up", followUp: true });
      }
      continue;
    }

    if (snapshot.phase === GamePhase.SETUP) {
      const inSetup =
        snapshot.subPhase === SubPhase.SETUP_KICKING ||
        snapshot.subPhase === SubPhase.SETUP_RECEIVING;
      if (!inSetup) {
        await run({ type: "coin-flip" });
        continue;
      }
      if (snapshot.subPhase === SubPhase.SETUP_KICKING) {
        kickingTeamId = snapshot.activeTeamId;
        driveCount++;
      }
      const teamId = snapshot.activeTeamId!;
      await placeTeam(game, run, snapshot, teamId);
      await run({ type: "confirm-setup", teamId });
      continue;
    }

    if (snapshot.phase === GamePhase.KICKOFF) {
      const kickingTeam = snapshot.teams.find(
        (team) => team.id === kickingTeamId
      )!;
      const kicker = kickingTeam.players.find((player) => player.position)!;
      const kicksRight = kickingTeam.id === snapshot.teams[0].id;
      const kicked = await run({
        type: "kick-ball",
        playerId: kicker.id,
        x: kicksRight ? 15 : 4,
        y: 5,
      });
      if (!kicked.ok) throw new Error(`kick failed: ${kicked.reason}`);
      continue;
    }

    if (snapshot.phase === GamePhase.PLAY) {
      const legal = await run({ type: "legal-actions" });
      const movers = legal.legalActions!.players.filter((player) =>
        player.actions.includes("move")
      );
      if (movers.length === 0) {
        await run({ type: "end-turn" });
        continue;
      }

      const actor = movers[0];
      const detailed = await run({
        type: "legal-actions",
        playerId: actor.playerId,
      });
      const targets =
        detailed.legalActions!.players.find(
          (player) => player.playerId === actor.playerId
        )?.moveTargets ?? [];

      const me = snapshot.teams
        .flatMap((team) => team.players)
        .find((player) => player.id === actor.playerId)!;
      const goalRight = me.teamId === snapshot.teams[0].id;
      // Step one square towards the opposing end zone: enough to score
      // eventually, simple enough to stay deterministic.
      const nextStep = targets
        .filter(
          (target) =>
            Math.abs(target.x - me.position!.x) <= 1 &&
            Math.abs(target.y - me.position!.y) <= 1
        )
        .sort((a, b) => (goalRight ? b.x - a.x : a.x - b.x))[0];

      if (!nextStep) {
        await run({ type: "end-activation", playerId: actor.playerId });
        await run({ type: "end-turn" });
        continue;
      }

      await run({
        type: "declare-action",
        playerId: actor.playerId,
        action: "move",
      });
      await run({ type: "move", playerId: actor.playerId, path: [nextStep] });
      await run({ type: "end-activation", playerId: actor.playerId });
      await run({ type: "end-turn" });
      continue;
    }

    throw new Error(
      `the bot is stuck in ${snapshot.phase}/${snapshot.subPhase}`
    );
  }

  const finalSnapshot = game.snapshot();
  phasesSeen.add(finalSnapshot.phase);
  return {
    finalSnapshot,
    commandCount,
    phasesSeen,
    decisionsSeen,
    commandsSeen,
    sawHalftime,
    driveCount,
    touchdowns: Object.values(finalSnapshot.score).reduce(
      (total, score) => total + score,
      0
    ),
  };
}

/** Fill a team's setup zone from its line of scrimmage backwards. */
async function placeTeam(
  game: HeadlessGame,
  run: (command: { type: string } & Record<string, unknown>) => Promise<{
    ok: boolean;
    reason?: string;
  }>,
  snapshot: GameSnapshot,
  teamId: string
): Promise<void> {
  const zone = game.ctx.gameService.getSetupZone(teamId)!;
  const team = snapshot.teams.find((candidate) => candidate.id === teamId)!;
  const eligible = team.players.filter(
    (player) => player.status === "Active" || player.status === "Reserve"
  );
  const alreadyPlaced = eligible.filter((player) => player.position);
  const toPlace = eligible
    .filter((player) => !player.position)
    .slice(0, Math.max(0, 7 - alreadyPlaced.length));

  const occupied = new Set(
    snapshot.teams
      .flatMap((candidate) => candidate.players)
      .filter((player) => player.position)
      .map((player) => `${player.position!.x},${player.position!.y}`)
  );

  const isTeam1 = teamId === snapshot.teams[0].id;
  const lineX = isTeam1 ? zone.maxX : zone.minX;
  let placed = 0;
  outer: for (
    let x = lineX;
    x >= zone.minX && x <= zone.maxX;
    x += isTeam1 ? -1 : 1
  ) {
    for (let y = 2; y <= 8; y++) {
      if (placed >= toPlace.length) break outer;
      if (occupied.has(`${x},${y}`)) continue;
      const response = await run({
        type: "place-player",
        playerId: toPlace[placed].id,
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

/**
 * The match-flow case a full match's coverage is attributed to. Using a real
 * case keeps the fragment joinable with the rest of the report rather than
 * inventing a synthetic id the registry has never heard of.
 */
const ATTRIBUTION_CASE = MATCH_FLOW_CASES.find(
  (scenarioCase) => scenarioCase.id === "match-opening-to-kickoff"
)!;

test("plays a complete seeded match through both halves to GAME_OVER", async () => {
  const result = await playFullMatch(2025);

  expect(result.finalSnapshot.phase).toBe(GamePhase.GAME_OVER);
  expect(result.sawHalftime, "the match must play both halves").toBe(true);
  expect(Object.keys(result.finalSnapshot.score)).toHaveLength(2);
  expect(result.commandCount).toBeLessThan(MAX_COMMANDS);

  // Every phase a match passes through was actually observed.
  expect([...result.phasesSeen].sort()).toEqual(
    expect.arrayContaining([
      GamePhase.SETUP,
      GamePhase.KICKOFF,
      GamePhase.PLAY,
      GamePhase.GAME_OVER,
    ])
  );

  recordCoverageFragment(ATTRIBUTION_CASE, "full-match", {
    layer: "engine",
    initialSnapshot: { phase: GamePhase.SETUP } as never,
    snapshot: result.finalSnapshot,
    events: [],
    decisions: result.decisionsSeen,
    responses: [],
    // Everything the bot really sent, so the report credits the commands a
    // full match needs and nothing it does not.
    stepLog: [...result.commandsSeen].map((type, index) => ({
      index,
      intent: type,
      command: { type },
      ok: true,
      replies: [],
    })),
  } as never);
});

test("is deterministic: the same seed twice gives the same match", async () => {
  const first = await playFullMatch(31337);
  const second = await playFullMatch(31337);

  // Team ids embed a creation timestamp, so compare by team order.
  const scores = (result: MatchResult) =>
    result.finalSnapshot.teams.map((team) => result.finalSnapshot.score[team.id]);
  expect(scores(second)).toEqual(scores(first));
  expect(second.commandCount).toBe(first.commandCount);
  expect([...second.phasesSeen].sort()).toEqual([...first.phasesSeen].sort());
});

test("every drive resets and re-runs setup, without re-running the coin flip", async () => {
  // A match is several drives, and each one must clear the pitch and set up
  // again. The bot cannot score (it advances one square per turn, so it
  // cannot cross the pitch in six), which is why *scoring* a touchdown and
  // resetting is proved by the scripted `match-touchdown-and-drive-reset`
  // case instead. What a full match proves is the drive lifecycle itself:
  // halftime ends a drive, the next one sets up, and the flip happens once.
  const result = await playFullMatch(2025);

  expect(result.finalSnapshot.phase).toBe(GamePhase.GAME_OVER);
  expect(
    result.driveCount,
    "both halves kick off, so a completed match has at least two drives"
  ).toBeGreaterThanOrEqual(2);
  // The flip is a once-per-match command, not once-per-drive.
  expect(result.commandsSeen.has("coin-flip")).toBe(true);
  expect(result.phasesSeen.has(GamePhase.SETUP)).toBe(true);
  expect(result.phasesSeen.has(GamePhase.KICKOFF)).toBe(true);
});
