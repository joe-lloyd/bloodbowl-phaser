/**
 * The computer coach, v2: sampled lookahead. At each new activation it takes
 * the planner's best few, and for each one clones the game, reseeds the dice
 * so a playout cannot see the real ones, plays the rest of our turn and the
 * opponent's reply with the planner, and scores the end position. Every option
 * meets the same dice, sample for sample, so the comparison is fair on few
 * samples. Only a declaration is searched; the planner carries it out.
 */

import { HeadlessGame } from "../../headless/HeadlessGame";
import { MatchSave } from "../../headless/serialization";
import { GamePhase } from "../../types/GameState";
import { Candidate, enumerateDecision } from "../candidates";
import { Coach, CoachChoice, CoachContext } from "../coach";
import { matchSaveAt } from "../replay";
import { CoachRng, createCoachRng } from "../rng";
import { Activation, activations } from "./activations";
import { readBoard } from "./board";
import { evaluate } from "./evaluate";
import { availableActions, createPlannerCoach, noteFor } from "./planner";
import { DEFAULT_WEIGHTS, Weights } from "./weights";

export interface SearchBudget {
  /** Playouts for each option in the first round. */
  samples: number;
  /** Options to compare at a declaration. */
  options: number;
  /** Give up and take the best so far after this long, if set. */
  deadlineMs?: number;
}

/** The levels above the plain planner, by how hard they look. */
export const BUDGETS = {
  hard: { samples: 2, options: 4, deadlineMs: 1500 },
  legend: { samples: 6, options: 4, deadlineMs: 4000 },
} as const satisfies Record<string, SearchBudget>;

interface Option {
  index: number;
  activation: Activation;
}

const PLAYOUT_COMMANDS = 200;

/** The declarations worth trying, the planner's favourite first. */
function shortlist(context: CoachContext, w: Weights, size: number): Option[] {
  const { game, point } = context;
  const board = readBoard(game, point.teamId);
  const out: Option[] = [];
  const seen = new Set<string>();
  for (const activation of activations(
    board,
    w,
    availableActions(point.candidates)
  )) {
    const id = `${activation.player.id}/${activation.action}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const index = point.candidates.findIndex((c: Candidate) => {
      const command = c.commands[0];
      return (
        command.type === "declare-action" &&
        !command.blockReplacement &&
        command.playerId === activation.player.id &&
        command.action === activation.action
      );
    });
    if (index >= 0) out.push({ index, activation });
    if (out.length >= size) break;
  }
  return out;
}

/** Play one option out to the end of our turn and score where it lands. */
async function playout(
  save: MatchSave,
  option: Option,
  us: string,
  seed: number,
  policy: Coach,
  rng: CoachRng,
  w: Weights
): Promise<number> {
  const game = new HeadlessGame({ matchSave: save, lazySnapshots: true });
  const live = () => game.ctx.gameService.getState();
  const state = game.ctx.rng.captureState();
  game.ctx.rng.restoreState({ ...state, currentSeed: seed });
  const first = await enumerateDecision(game, null);
  const opening = first.candidates[option.index];
  if (opening) await game.execute(opening.commands[0]);

  // Our turn and the other side's answer to it: a position is judged by
  // what the opponent can do to it, not by how it looks before they move.
  let handedOver = false;
  const startScore = { ...save.snapshot.score };
  for (let steps = 0; steps < PLAYOUT_COMMANDS; steps++) {
    const state = live();
    const scored = Object.keys(startScore).some(
      (t) => (state.score[t] ?? 0) !== startScore[t]
    );
    if (state.activeTeamId !== us) handedOver = true;
    if (
      scored ||
      state.phase !== GamePhase.PLAY ||
      (handedOver && state.activeTeamId === us && !game.pendingDecision())
    )
      break;
    const point = await enumerateDecision(game, null);
    if (point.candidates.length === 0) break;
    const { index } = await policy.choose({
      game,
      get snapshot() {
        return game.snapshot();
      },
      point,
      rng,
    });
    const candidate = point.candidates[index] ?? point.candidates[0];
    let refused = false;
    for (const command of candidate.commands)
      if (!(await game.execute(command)).ok) refused = true;
    if (refused) break;
  }
  return evaluate(readBoard(game, us), w);
}

/** A seed for one sample of one decision, well spread. */
const sampleSeed = (base: number, sample: number) =>
  (Math.imul(base ^ (sample + 1), 0x9e3779b1) >>> 0) % 2147483647 || 1;

export function createSearchCoach(options: {
  weights?: Weights;
  name?: string;
  budget: SearchBudget;
}): Coach {
  const w = options.weights ?? DEFAULT_WEIGHTS;
  const { budget } = options;
  const policy = createPlannerCoach({ weights: w });
  return {
    name: options.name ?? "search",
    async choose(context: CoachContext): Promise<CoachChoice> {
      const { game, point } = context;
      const active = game.ctx.gameService.getState().activePlayer;
      if (point.pending || point.phase !== GamePhase.PLAY || active)
        return policy.choose(context);
      const list = shortlist(context, w, budget.options);
      if (list.length < 2) return policy.choose(context);

      const started = Date.now();
      const late = () =>
        budget.deadlineMs !== undefined &&
        Date.now() - started > budget.deadlineMs;
      const save = matchSaveAt(game);
      const base = context.rng.int(2147483647);
      const quiet = createCoachRng(base);
      const totals = list.map(() => 0);
      const counts = list.map(() => 0);
      const mean = (i: number) =>
        counts[i] ? totals[i] / counts[i] : -Infinity;

      // Successive halving: all options a little, the leaders some more.
      let alive = list.map((_, i) => i);
      let sampleAt = 0;
      for (let round = 0; alive.length > 1 && !late(); round++) {
        const samples = round === 0 ? budget.samples : budget.samples * 2;
        for (let s = 0; s < samples && !late(); s++) {
          const seed = sampleSeed(base, sampleAt++);
          for (const i of alive) {
            totals[i] += await playout(
              save,
              list[i],
              point.teamId,
              seed,
              policy,
              quiet,
              w
            );
            counts[i]++;
            if (late()) break;
          }
        }
        alive = [...alive]
          .sort((a, b) => mean(b) - mean(a))
          .slice(0, Math.max(1, alive.length >> 1));
        if (!alive.includes(0) && alive.length > 0) alive.push(0);
        if (alive.length === 2 && round > 0) break;
      }
      // The plan stands unless a rival beats it on the same dice.
      const rival = alive[0] ?? 0;
      const best = mean(rival) > mean(0) ? rival : 0;
      const pick = list[best];
      return { index: pick.index, note: noteFor(pick.activation) };
    },
  };
}
