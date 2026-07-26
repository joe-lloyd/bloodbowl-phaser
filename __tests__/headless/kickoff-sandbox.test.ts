import { describe, expect, it } from "vitest";
import {
  KICKOFF_EXAMPLE_SEEDS,
  KICKOFF_SCENARIOS,
  findKickoffConfig,
} from "../../src/data/kickoffScenarios";
import {
  INTERACTIVE_KICKOFF_EVENTS,
  KickoffEvent,
} from "../../src/game/kickoff/kickoffEvents";
import { runRuleConfig } from "../../src/game/rules-lab";
import { GameEventNames } from "../../src/types/events";

describe("kickoff-table sandbox catalog", () => {
  it("offers standard and late-half scenarios with every table result", () => {
    expect(KICKOFF_SCENARIOS.map((config) => config.id)).toEqual([
      "kickoff-table-standard",
      "kickoff-table-late-half",
    ]);
    expect(findKickoffConfig("kickoff-table-standard")).toBe(
      KICKOFF_SCENARIOS[0]
    );

    for (const config of KICKOFF_SCENARIOS) {
      expect(config.outcomes).toHaveLength(11);
      expect(config.outcomes.map((outcome) => outcome.exampleSeed)).toEqual(
        Object.values(KICKOFF_EXAMPLE_SEEDS)
      );
    }
  });

  it("replays every curated seed as its selected result", async () => {
    for (const config of KICKOFF_SCENARIOS) {
      for (const outcome of config.outcomes) {
        expect(outcome.exampleSeed).toBeTypeOf("number");
        const result = await runRuleConfig(config, outcome.exampleSeed!);
        expect(outcome.matches(result), `${config.id}: ${outcome.name}`).toBe(
          true
        );

        const kickoff = result.events.find(
          (event) => event.name === GameEventNames.KickoffResult
        )?.data as { event?: KickoffEvent } | undefined;
        expect(kickoff?.event).toBe(outcome.name.replace(/^\d+ — /, ""));

        if (
          kickoff?.event &&
          INTERACTIVE_KICKOFF_EVENTS.has(kickoff.event)
        ) {
          expect(result.decisions).toContainEqual(
            expect.objectContaining({
              type: "kickoff-event",
              event: kickoff.event,
            })
          );
        }
      }
    }
  });

  it("makes the two Time-Out branches directly testable", async () => {
    const standard = await runRuleConfig(
      KICKOFF_SCENARIOS[0],
      KICKOFF_EXAMPLE_SEEDS[KickoffEvent.TIME_OUT]
    );
    expect(standard.game.ctx.gameService.getTurnNumber("team1")).toBe(3);
    expect(standard.game.ctx.gameService.getTurnNumber("team2")).toBe(4);

    const lateHalf = await runRuleConfig(
      KICKOFF_SCENARIOS[1],
      KICKOFF_EXAMPLE_SEEDS[KickoffEvent.TIME_OUT]
    );
    expect(lateHalf.game.ctx.gameService.getTurnNumber("team1")).toBe(4);
    expect(lateHalf.game.ctx.gameService.getTurnNumber("team2")).toBe(5);
  });
});
