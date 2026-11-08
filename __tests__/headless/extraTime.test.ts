/**
 * Extra Time and Penalties (2025 rulebook, p.87): a knockout tie level after
 * the second half plays Extra Time, a further half with the Team Re-rolls
 * left over, after a roll-off whose winner chooses who kicks. If it is
 * still level after that, five roll-offs decide it.
 */
import { describe, expect, it } from "vitest";
import { createSimGame, runMatch } from "../../src/simulation/runMatch";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";

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
  let fullTime = "";
  eventBus.on(GameEventNames.UI_GameLog, (line) => {
    if (String(line).startsWith("FULL TIME")) fullTime = String(line);
  });
  const rollOff: Record<string, number>[] = [];
  eventBus.on(GameEventNames.DiceRoll, (roll) => {
    if (!roll.rollType.startsWith("Extra Time roll-off")) return;
    if (roll.teamId === home) rollOff.push({ [home]: roll.value });
    else rollOff[rollOff.length - 1][away] = roll.value;
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
    fullTime,
    rollOffWinner: last && (last[home] > last[away] ? 0 : 1),
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
    for (let seed = 1; seed <= 16; seed++) {
      const game = await play(seed, true);
      const { state, home, away } = game;
      expect(game.recording.findings, `seed ${seed}`).toEqual([]);
      expect(state.phase, `seed ${seed}`).toBe(GamePhase.GAME_OVER);
      const level = state.score[home] === state.score[away];
      if (!game.rerollsInExtraTime) {
        expect(level, `seed ${seed}`).toBe(false);
        seen.noExtraTime++;
        continue;
      }
      // The roll-off's winner chose who kicks
      expect(game.kickChoice?.team, `seed ${seed}`).toBe(game.rollOffWinner);
      // Re-rolls spent in the second half stay spent
      expect(game.rerollsInExtraTime, `seed ${seed}`).toEqual(
        game.rerollsAtFullTime
      );
      if (Object.values(game.rerollsInExtraTime).some((used) => used > 0))
        seen.rerollsCarried++;
      const penalties = state.result?.penalties;
      if (!level) {
        expect(penalties, `seed ${seed}`).toBeUndefined();
        seen.wonInExtraTime++;
        continue;
      }
      expect(penalties![home] + penalties![away], `seed ${seed}`).toBe(5);
      // Full time names the winner, not a draw
      const [won, lost] = [penalties![home], penalties![away]].sort().reverse();
      const winner = penalties![home] > penalties![away] ? "Home" : "Away";
      expect(game.fullTime, `seed ${seed}`).toMatch(
        `(${winner} win on Penalties, ${won}–${lost})`
      );
      seen.penalties++;
    }
    for (const [outcome, count] of Object.entries(seen))
      expect(count, outcome).toBeGreaterThan(0);
  }, 120_000);

  it("ends a game level after the second half as a draw when it is not a knockout", async () => {
    // Seed 1 is 0-0 at full time, and goes to Penalties as a knockout
    const knockout = await play(1, true);
    expect(knockout.state.result?.penalties).toBeDefined();
    const friendly = await play(1, false);
    expect(friendly.state.score[friendly.home]).toBe(
      friendly.state.score[friendly.away]
    );
    expect(friendly.rerollsInExtraTime).toBeUndefined();
    expect(friendly.state.result).toEqual({ reason: "completed" });
  }, 60_000);
});
