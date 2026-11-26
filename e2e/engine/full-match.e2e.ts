import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "../support/engineTest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { type GameSnapshot } from "../../src/headless/serialization";
import { type PendingDecision } from "../../src/headless/protocol";
import { recordCoverageFragment } from "../support/coverageFragments";
import { MATCH_FLOW_CASES } from "../../src/testing/cases";
import { byCodeUnit } from "../../src/game/core/order";

const MAX_COMMANDS = 600;

type Run = (command: { type: string } & Record<string, unknown>) => Promise<{
  ok: boolean;
  reason?: string;
}>;

interface MatchResult {
  finalSnapshot: GameSnapshot;
  commandCount: number;

  phasesSeen: Set<string>;

  decisionsSeen: PendingDecision[];

  commandsSeen: Set<string>;
  sawHalftime: boolean;
  touchdowns: number;

  driveCount: number;
}

async function playFullMatch(seed: number): Promise<MatchResult> {
  const game = new HeadlessGame({ seed, startingPhase: GamePhase.SETUP });

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
      await answerDecision(pending, snapshot, run);
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
      const teamId = fixtureValue(snapshot.activeTeamId);
      await placeTeam(game, run, snapshot, teamId);
      await run({ type: "confirm-setup", teamId });
      continue;
    }

    if (snapshot.phase === GamePhase.KICKOFF) {
      const kickingTeam = fixtureValue(snapshot.teams.find(
        (team) => team.id === kickingTeamId
      ));
      const kicker = fixtureValue(kickingTeam.players.find((player) => player.position));
      const kicksRight = kickingTeam.id === fixtureValue(snapshot.teams[0]).id;
      const kicked = await run({
        type: "kick-ball",
        playerId: kicker.id,
        x: kicksRight ? 15 : 4,
        y: 5,
      });
      if (!kicked.ok) throw new Error(`kick failed: ${String(kicked.reason)}`);
      continue;
    }

    if (snapshot.phase === GamePhase.PLAY) {
      const legal = await run({ type: "legal-actions" });
      const movers = fixtureValue(legal.legalActions).players.filter((player) =>
        player.actions.includes("move")
      );
      if (movers.length === 0) {
        await run({ type: "end-turn" });
        continue;
      }

      const actor = movers[0];
      const detailed = await run({
        type: "legal-actions",
        playerId: fixtureValue(actor).playerId,
      });
      const targets =
        fixtureValue(detailed.legalActions).players.find(
          (player) => player.playerId === fixtureValue(actor).playerId
        )?.moveTargets ?? [];

      const me = fixtureValue(snapshot.teams
        .flatMap((team) => team.players)
        .find((player) => player.id === fixtureValue(actor).playerId));
      const goalRight = me.teamId === fixtureValue(snapshot.teams[0]).id;

      const nextStep = targets
        .filter(
          (target) =>
            Math.abs(target.x - fixtureValue(me.position).x) <= 1 &&
            Math.abs(target.y - fixtureValue(me.position).y) <= 1
        )
        .sort((a, b) => (goalRight ? b.x - a.x : a.x - b.x))[0];

      if (!nextStep) {
        await run({ type: "end-activation", playerId: fixtureValue(actor).playerId });
        await run({ type: "end-turn" });
        continue;
      }

      await run({
        type: "declare-action",
        playerId: fixtureValue(actor).playerId,
        action: "move",
      });
      await run({ type: "move", playerId: fixtureValue(actor).playerId, path: [nextStep] });
      await run({ type: "end-activation", playerId: fixtureValue(actor).playerId });
      await run({ type: "end-turn" });
      continue;
    }

    throw new Error(
      `the bot is stuck in ${snapshot.phase}/${String(snapshot.subPhase)}`
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

async function answerDecision(
  pending: PendingDecision,
  snapshot: GameSnapshot,
  run: Run
): Promise<void> {
  switch (pending.type) {
    case "kickoff-event":
      await run({ type: "kickoff-skip" });
      return;
    case "block-dice":
      await run({ type: "choose-block-result", index: 0 });
      return;
    case "push-direction": {
      const direction = pending.options[0];
      await run({
        type: "choose-push-direction",
        x: fixtureValue(direction).x,
        y: fixtureValue(direction).y,
      });
      return;
    }
    case "touchback": {
      const receiver = fixtureValue(fixtureValue(snapshot.teams
        .find((team) => team.id === pending.teamId))
        .players.find(
          (player) => player.position && player.status === "Active"
        ));
      await run({ type: "touchback", playerId: receiver.id });
      return;
    }
    case "reroll":
      await run({ type: "use-reroll", accept: false });
      return;
    case "reaction":
      await run({ type: "use-reaction", accept: false });
      return;
    case "interception":
      await run({ type: "choose-interception" });
      return;
    default:
      await run({ type: "choose-follow-up", followUp: true });
  }
}

async function placeTeam(
  game: HeadlessGame,
  run: Run,
  snapshot: GameSnapshot,
  teamId: string
): Promise<void> {
  const zone = fixtureValue(game.ctx.gameService.getSetupZone(teamId));
  const team = fixtureValue(snapshot.teams.find((candidate) => candidate.id === teamId));
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
      .map(
        (player) =>
          `${String(fixtureValue(player.position).x)},${String(fixtureValue(player.position).y)}`
      )
  );

  const isTeam1 = teamId === fixtureValue(snapshot.teams[0]).id;
  const lineX = isTeam1 ? zone.maxX : zone.minX;
  let placed = 0;
  outer: for (
    let x = lineX;
    x >= zone.minX && x <= zone.maxX;
    x += isTeam1 ? -1 : 1
  ) {
    for (let y = 2; y <= 8; y++) {
      if (placed >= toPlace.length) break outer;
      if (occupied.has(`${String(x)},${String(y)}`)) continue;
      const response = await run({
        type: "place-player",
        playerId: fixtureValue(toPlace[placed]).id,
        x,
        y,
      });
      if (!response.ok) {
        continue;
      }

      occupied.add(`${String(x)},${String(y)}`);
      placed++;
    }
  }
}

const ATTRIBUTION_CASE = fixtureValue(MATCH_FLOW_CASES.find(
  (scenarioCase) => scenarioCase.id === "match-opening-to-kickoff"
));

test("plays a complete seeded match through both halves to GAME_OVER", async () => {
  const result = await playFullMatch(2025);

  expect(result.finalSnapshot.phase).toBe(GamePhase.GAME_OVER);
  expect(result.sawHalftime, "the match must play both halves").toBe(true);
  expect(Object.keys(result.finalSnapshot.score)).toHaveLength(2);
  expect(result.commandCount).toBeLessThan(MAX_COMMANDS);

  expect([...result.phasesSeen].sort(byCodeUnit)).toEqual(
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

    stepLog: [...result.commandsSeen].map((type, index) => ({
      index,
      intent: type,
      command: { type },
      ok: true,
      replies: [],
    })),
  } as never);
});

const scores = (result: MatchResult) =>
  result.finalSnapshot.teams.map((team) => result.finalSnapshot.score[team.id]);

test("is deterministic: the same seed twice gives the same match", async () => {
  const first = await playFullMatch(31_337);
  const second = await playFullMatch(31_337);

  expect(scores(second)).toEqual(scores(first));
  expect(second.commandCount).toBe(first.commandCount);
  expect([...second.phasesSeen].sort(byCodeUnit)).toEqual(
    [...first.phasesSeen].sort(byCodeUnit)
  );
});

test("every drive resets and re-runs setup, without re-running the coin flip", async () => {
  const result = await playFullMatch(2025);

  expect(result.finalSnapshot.phase).toBe(GamePhase.GAME_OVER);
  expect(
    result.driveCount,
    "both halves kick off, so a completed match has at least two drives"
  ).toBeGreaterThanOrEqual(2);

  expect(result.commandsSeen.has("coin-flip")).toBe(true);
  expect(result.phasesSeen.has(GamePhase.SETUP)).toBe(true);
  expect(result.phasesSeen.has(GamePhase.KICKOFF)).toBe(true);
});
