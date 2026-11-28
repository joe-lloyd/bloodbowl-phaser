import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import {
  findSeed,
  playSetup,
  playerAt,
  runRuleConfig,
  turnoverHappened,
  type RuleConfig,
} from "../../src/game/rules-lab";
import { HANDOFF_ACTION_SCENARIOS } from "../../src/data/ruleScenarios/passing";
import { RULE_SCENARIOS } from "../../src/data/ruleScenarios";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { runMatch } from "../../src/simulation/runMatch";
import { runFourSeatMatch } from "../../src/simulation/fourSeat";
import type { Coach } from "../../src/simulation/coach";
import { type MatchTelemetry, watchMatch } from "../../src/simulation/telemetry";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";

async function observed(config: RuleConfig, outcomeId: string) {
  const { seed } = await findSeed(config, outcomeId);
  let telemetry: MatchTelemetry | undefined;
  await runRuleConfig(config, seed, (game) => {
    telemetry = watchMatch(game);
  });
  const [ours, theirs] = fixtureValue(telemetry).teams();
  return { ours: fixtureValue(ours), theirs: fixtureValue(theirs) };
}

const straight = (from: number, squares: number) =>
  Array.from({ length: squares }, (_, i) => ({ x: from + i + 1, y: 5 }));

const RUSH: RuleConfig = {
  id: "telemetry-rush",
  name: "Rush one square past MA",
  description: "A Human Lineman moves seven squares on MA 6",
  rerolls: { team1: 0 },
  setup: playSetup({
    team1Placements: [{ playerIndex: 0, x: 2, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
    ballPosition: { x: 1, y: 1 },
  }),
  script: [
    { type: "declare-action", playerId: "team1:0", action: "move" },
    { type: "move", playerId: "team1:0", path: straight(2, 7) },
  ],
  outcomes: [
    {
      id: "made-it",
      name: "The Rush succeeds",
      matches: (r) => playerAt(r, "team1:0", { x: 9, y: 5 }),
    },
    { id: "fell", name: "The Rush fails", matches: turnoverHappened },
  ],
};

const PASS: RuleConfig = {
  id: "telemetry-pass",
  name: "A Quick Pass is caught",
  description: "A Human Lineman throws three squares to a team-mate",
  rerolls: { team1: 0 },
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 },
      { playerIndex: 1, x: 7, y: 5 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
    ballPosition: { x: 4, y: 5 },
  }),
  script: [
    { type: "declare-action", playerId: "team1:0", action: "pass" },
    { type: "pass", playerId: "team1:0", x: 7, y: 5 },
  ],
  outcomes: [
    {
      id: "caught",
      name: "The receiver holds the ball",
      matches: (r) =>
        !turnoverHappened(r) &&
        r.snapshot.ballPosition?.x === 7 &&
        r.snapshot.ballPosition.y === 5,
    },
  ],
};

const config = (skill: SkillType, id: string) =>
  fixtureValue(
    fixtureValue(RULE_SCENARIOS.find((entry) => entry.skill === skill)).configs.find(
      (candidate) => candidate.id === id
    )
  );

describe("match telemetry", () => {
  it("counts a made Rush and a failed one with its Turnover", async () => {
    const made = await observed(RUSH, "made-it");
    expect(made.ours.tallies).toMatchObject({ rushes: 1, failedRushes: 0, turnovers: 0 });
    const fell = await observed(RUSH, "fell");
    expect(fell.ours.tallies).toMatchObject({ rushes: 1, failedRushes: 1, turnovers: 1 });
    expect(fell.theirs.tallies.rushes).toBe(0);
  });

  it("counts a caught pass as a pass and a completion, not a hand-off", async () => {
    const { ours } = await observed(PASS, "caught");
    expect(ours.tallies).toMatchObject({ passes: 1, completions: 1, handoffs: 0, turnovers: 0 });
  });

  it("counts a hand-off after a pick-up, with no pass", async () => {
    const handoff = fixtureValue(
      HANDOFF_ACTION_SCENARIOS.find((candidate) => candidate.id === "handoff-no-pa-test")
    );
    const { ours } = await observed(handoff, "completes-with-no-pa-test");
    expect(ours.tallies).toMatchObject({
      handoffs: 1,
      passes: 0,
      completions: 0,
      pickups: 1,
      failedPickups: 0,
    });
  });

  it("counts a skill re-roll as a trigger and a re-roll by its source", async () => {
    const { ours } = await observed(
      config(SkillType.SURE_FEET, "sure-feet-rush"),
      "skill-reroll-offered"
    );
    expect(ours.skills).toEqual({ "Sure Feet": 1 });
    expect(ours.rerolls).toEqual({ "skill:Sure Feet": 1 });
    expect(ours.held).toContain("Sure Feet");
    expect(ours.tallies.rushes).toBe(2);
  });

  it("counts a Projectile Vomit offered and chosen through the coach seam", async () => {
    const fixture = config(SkillType.PROJECTILE_VOMIT, "projectile-vomit-action");
    const game = new HeadlessGame({
      scenario: { id: fixture.id, name: fixture.name, description: fixture.description, setup: fixture.setup },
      seed: 1,
    });
    const vomiter: Coach = {
      name: "vomiter",
      choose: ({ point }) =>
        Promise.resolve({
          index: point.candidates.findIndex((candidate) => {
            const [command] = candidate.commands;
            return command.type === "declare-action" && command.action === "vomit";
          }),
        }),
    };
    const recording = await runMatch({
      seed: 1,
      rosters: [RosterName.UNDERWORLD_DENIZENS, RosterName.HUMAN],
      coaches: [vomiter, vomiter],
      game,
      inducements: false,
      maxCommands: 1,
    });
    const [ours, theirs] = fixtureValue(recording.telemetry);
    expect(ours.offered["declare:vomit"]).toBe(1);
    expect(ours.offered["declare:move"]).toBe(1);
    expect(ours.chosen).toEqual({ "declare:vomit": 1 });
    expect(ours.actions).toEqual({ vomit: 1 });
    expect(ours.held).toContain("Projectile Vomit");
    expect(theirs.offered).toEqual({});
    expect(fixtureValue(recording.stats)[0].actions).toEqual({ vomit: 1 });
  });

  it("counts each four-seat decision once, for the seat that made it", async () => {
    const choices = [0, 0, 0, 0];
    const seat = (index: number): Coach => ({
      name: `seat ${String(index)}`,
      choose: () => {
        choices[index] = (choices[index] ?? 0) + 1;
        return Promise.resolve({ index: 0 });
      },
    });
    const run = await runFourSeatMatch({
      seed: 5,
      rosters: [RosterName.HUMAN, RosterName.ORC, RosterName.SKAVEN, RosterName.DWARF],
      coaches: [seat(0), seat(1), seat(2), seat(3)],
      maxCommands: 60,
    });
    const chosen = run.telemetry.map((team) => Object.values(team.chosen).reduce((sum, n) => sum + n, 0));
    expect(chosen).toEqual(choices);
    expect(choices.reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);
  });
});
