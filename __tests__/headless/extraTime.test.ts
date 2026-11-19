import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { createSimGame, runMatch } from "../../src/simulation/runMatch";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { GameConfig } from "../../src/config/GameConfig";

const ROSTERS: [RosterName, RosterName] = [RosterName.HUMAN, RosterName.ORC];

async function play(seed: number, knockout: boolean) {
  const game = createSimGame(seed, ROSTERS, 3, "sevens-lineup");
  const state = () => game.ctx.gameService.getState();
  if (knockout) state().knockout = true;
  const { eventBus } = game.ctx;
  const [home, away] = [game.ctx.team1.id, game.ctx.team2.id];

  let rerollsAtFullTime: Record<string, number> | undefined;
  let rerollsInExtraTime: Record<string, number> | undefined;
  eventBus.on(GameEventNames.TurnEnded, () => {
    if (!state().turn.extraTime)
      rerollsAtFullTime = { ...state().teamRerollsUsed };
  });
  eventBus.on(GameEventNames.PhaseChanged, ({ phase }) => {
    if (phase === GamePhase.HALFTIME && state().turn.extraTime)
      rerollsInExtraTime = { ...state().teamRerollsUsed };
  });

  const extraTimeTurns: Record<string, [number, number]> = {};
  let extraTimeOpeningKickoff: KickoffEvent | undefined;
  eventBus.on(GameEventNames.KickoffResult, ({ event }) => {
    if (state().turn.extraTime && Object.keys(extraTimeTurns).length === 0)
      extraTimeOpeningKickoff = event;
  });
  eventBus.on(GameEventNames.TurnStarted, ({ teamId, turnNumber }) => {
    if (!state().turn.extraTime) return;
    extraTimeTurns[teamId] = [
      extraTimeTurns[teamId]?.[0] ?? turnNumber,
      turnNumber,
    ];
  });
  let fullTime = "";
  eventBus.on(GameEventNames.UI_GameLog, (line) => {
    if (line.startsWith("FULL TIME")) fullTime = line;
  });
  const rollOff: Record<string, number>[] = [];

  let extraTimeKickoff: number | undefined;
  eventBus.on(GameEventNames.DiceRoll, (roll) => {
    if (state().turn.extraTime && roll.rollType === "Kickoff Event")
      extraTimeKickoff ??= roll.total;
  });
  eventBus.on(GameEventNames.DiceRoll, (roll) => {
    if (!roll.rollType.startsWith("Extra Time roll-off")) return;
    if (roll.teamId === home)
      rollOff.push({ [home]: z.number().parse(roll.value) });
    else
      fixtureValue(rollOff[rollOff.length - 1])[away] = z
        .number()
        .parse(roll.value);
  });

  const recording = await runMatch({
    seed,
    rosters: ROSTERS,
    coaches: [heuristicCoach, heuristicCoach],
    game,
  });
  const last = rollOff[rollOff.length - 1];
  return {
    recording,
    state: state(),
    home,
    away,
    rerollsAtFullTime,
    rerollsInExtraTime,
    extraTimeTurns,
    extraTimeOpeningKickoff,
    fullTime,
    rollOffWinner:
      last && (fixtureValue(last[home]) > fixtureValue(last[away]) ? 0 : 1),
    kickChoice: recording.steps.find((step) => step.label === "Use Extra Time"),
  };
}

describe("a knockout tie", () => {
  it("goes to Extra Time when level, and to Penalties if still level", async () => {
    const seen = {
      noExtraTime: 0,
      wonInExtraTime: 0,
      penalties: 0,
      rerollsCarried: 0,
    };

    for (const seed of [...Array.from({ length: 16 }, (_, i) => i + 1), 34]) {
      const game = await play(seed, true);
      const { state, home, away } = game;
      expect(game.recording.findings, `seed ${String(seed)}`).toEqual([]);
      expect(state.phase, `seed ${String(seed)}`).toBe(GamePhase.GAME_OVER);
      const level = state.score[home] === state.score[away];
      if (!game.rerollsInExtraTime) {
        expect(level, `seed ${String(seed)}`).toBe(false);
        seen.noExtraTime++;
        continue;
      }

      expect(game.kickChoice?.team, `seed ${String(seed)}`).toBe(
        game.rollOffWinner
      );

      expect(game.rerollsInExtraTime, `seed ${String(seed)}`).toEqual(
        game.rerollsAtFullTime
      );
      if (Object.values(game.rerollsInExtraTime).some((used) => used > 0))
        seen.rerollsCarried++;
      const penalties = state.result?.penalties;
      if (!level) {
        expect(penalties, `seed ${String(seed)}`).toBeUndefined();
        seen.wonInExtraTime++;
        continue;
      }
      expect(
        fixtureValue(fixtureValue(penalties)[home]) +
          fixtureValue(fixtureValue(penalties)[away]),
        `seed ${String(seed)}`
      ).toBe(5);

      const firstTurn =
        game.extraTimeOpeningKickoff === KickoffEvent.TIME_OUT ? 2 : 1;
      const fullHalf = [firstTurn, GameConfig.TURNS_PER_HALF];
      expect(game.extraTimeTurns, `seed ${String(seed)}`).toEqual({
        [home]: fullHalf,
        [away]: fullHalf,
      });

      const [won, lost] = [
        fixtureValue(penalties)[home],
        fixtureValue(penalties)[away],
      ]
        .sort()
        .reverse();
      const winner =
        fixtureValue(fixtureValue(penalties)[home]) >
        fixtureValue(fixtureValue(penalties)[away])
          ? "Home"
          : "Away";
      expect(game.fullTime, `seed ${String(seed)}`).toMatch(
        `(${winner} win on Penalties, ${String(won)}–${String(lost)})`
      );
      seen.penalties++;
    }
    for (const [outcome, count] of Object.entries(seen))
      expect(count, outcome).toBeGreaterThan(0);
  }, 120_000);

  it("ends a game level after the second half as a draw when it is not a knockout", async () => {
    const knockout = await play(2, true);
    expect(knockout.state.result?.penalties).toBeDefined();
    const friendly = await play(2, false);
    expect(friendly.state.score[friendly.home]).toBe(
      friendly.state.score[friendly.away]
    );
    expect(friendly.rerollsInExtraTime).toBeUndefined();
    expect(friendly.state.result).toEqual({ reason: "completed" });
  }, 60_000);
});
