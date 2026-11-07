/**
 * The computer coach, v2: sampled lookahead. At each new activation it takes
 * the planner's best few, and for each one clones the game, reseeds the dice
 * so a playout cannot see the real ones, plays the rest of our turn and the
 * opponent's reply with the planner, and scores the end position. Every option
 * meets the same dice, sample for sample, so the comparison is fair on few
 * samples. The choices inside an action, block dice, re-rolls, pushes and
 * follow-ups, are searched the same way from a fork of the game; the planner
 * carries out the rest.
 */

import { stateChecksum } from "../../headless/checksum";
import { GameFork, HeadlessGame } from "../../headless/HeadlessGame";
import { GamePhase } from "../../types/GameState";
import { Candidate, enumerateDecision } from "../candidates";
import { Coach, CoachChoice, CoachContext } from "../coach";
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
  hard: { samples: 8, options: 4, deadlineMs: 1500 },
  legend: { samples: 16, options: 4, deadlineMs: 4000 },
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

/** A copy of the game at the fork's position, with the dice as they were. */
async function replay(root: GameFork): Promise<HeadlessGame> {
  const game = new HeadlessGame({ matchSave: root.save, lazySnapshots: true });
  for (const command of root.since) await game.execute(command);
  return game;
}

/**
 * Candidate `index`'s score on one roll of the dice, from `us`'s side:
 * copy of the game with the dice reseeded, so it cannot see the real ones,
 * play our turn and the other side's answer to it with the planner, and
 * score where it lands. A position is judged by what the opponent can do to
 * it, not by how it looks before they move. The score depends on nothing
 * else, so playouts can run in any order, anywhere.
 */
export async function scorePlayout(
  root: GameFork,
  us: string,
  index: number,
  seed: number,
  w: Weights = DEFAULT_WEIGHTS
): Promise<number> {
  const game = await replay(root);
  const dice = game.ctx.rng.captureState();
  game.ctx.rng.restoreState({ ...dice, currentSeed: seed });
  const startScore = { ...game.ctx.gameService.getState().score };
  const first = await enumerateDecision(game, null);
  const opening = first.candidates[index];
  if (opening) await game.execute(opening.commands[0]);

  const policy = createPlannerCoach({ weights: w });
  // The planner draws nothing at random, but a decision it leaves to the
  // heuristic does: its own stream keeps the playout a function of its seed.
  const rng = createCoachRng(sampleSeed(seed, index));
  let handedOver = false;
  for (let steps = 0; steps < PLAYOUT_COMMANDS; steps++) {
    const state = game.ctx.gameService.getState();
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
  return evaluate(readBoard(game, us));
}

/** A seed for one sample of one decision, well spread. */
const sampleSeed = (base: number, sample: number) =>
  (Math.imul(base ^ (sample + 1), 0x9e3779b1) >>> 0) % 2147483647 || 1;

/** One round of playouts: these candidates, each on each of these seeds. */
export interface PlayoutRound {
  root: GameFork;
  us: string;
  indices: number[];
  seeds: number[];
  /** Date.now() after which no playout starts. */
  deadlineAt?: number;
}

/**
 * Plays a round out: a row for each seed, a score in each row for each
 * candidate, in order. Every candidate meets the same dice, so a seed the
 * deadline cut short is left out for all of them.
 */
export type Playouts = (round: PlayoutRound) => Promise<number[][]>;

/** Playouts in this thread, one after another. */
export function playoutsHere(w: Weights): Playouts {
  return async ({ root, us, indices, seeds, deadlineAt }) => {
    const late = () => deadlineAt !== undefined && Date.now() > deadlineAt;
    const rows: number[][] = [];
    for (const seed of seeds) {
      const row: number[] = [];
      for (const index of indices) {
        if (late()) return rows;
        row.push(await scorePlayout(root, us, index, seed, w));
      }
      rows.push(row);
    }
    return rows;
  };
}

/** The planner, with its declarations and in-action choices checked by playouts. */
export function createSearchCoach(options: {
  weights?: Weights;
  name?: string;
  budget: SearchBudget;
  /** Where the playouts run; in this thread by default. */
  playouts?: Playouts;
}): Coach {
  const w = options.weights ?? DEFAULT_WEIGHTS;
  const { budget } = options;
  const policy = createPlannerCoach({ weights: w });
  const playouts = options.playouts ?? playoutsHere(w);

  /**
   * Which of `indices` to play, by successive halving: all of them a little,
   * the leaders some more. The first is the plan, and it stands unless a
   * rival still in the running beats it on the same dice. Returns a position
   * in `indices`.
   */
  const searchAmong = async (
    root: GameFork,
    us: string,
    indices: number[],
    rng: CoachRng
  ): Promise<number> => {
    const deadlineAt =
      budget.deadlineMs === undefined
        ? undefined
        : Date.now() + budget.deadlineMs;
    const late = () => deadlineAt !== undefined && Date.now() > deadlineAt;
    const base = rng.int(2147483647);
    const totals = indices.map(() => 0);
    const counts = indices.map(() => 0);
    const mean = (i: number) => (counts[i] ? totals[i] / counts[i] : -Infinity);

    let alive = indices.map((_, i) => i);
    let sampleAt = 0;
    for (let round = 0; alive.length > 1 && !late(); round++) {
      const samples = round === 0 ? budget.samples : budget.samples * 2;
      const seeds = Array.from({ length: samples }, () =>
        sampleSeed(base, sampleAt++)
      );
      const rows = await playouts({
        root,
        us,
        indices: alive.map((i) => indices[i]),
        seeds,
        deadlineAt,
      });
      for (const row of rows)
        alive.forEach((i, k) => {
          totals[i] += row[k];
          counts[i]++;
        });
      // A round the deadline cut short is the last.
      if (rows.length < seeds.length) break;
      alive = [...alive]
        .sort((a, b) => mean(b) - mean(a))
        .slice(0, Math.max(1, alive.length >> 1));
      if (!alive.includes(0) && alive.length > 0) alive.push(0);
      if (alive.length === 2 && round > 0) break;
    }
    const rival = [...alive].sort((a, b) => mean(b) - mean(a))[0] ?? 0;
    return mean(rival) > mean(0) ? rival : 0;
  };

  /** A new activation: the planner's best few declarations. */
  const declare = async (context: CoachContext): Promise<CoachChoice> => {
    const { game, point } = context;
    const list = shortlist(context, w, budget.options);
    if (list.length < 2) return policy.choose(context);
    const best = await searchAmong(
      { save: game.matchSave(), since: [] },
      point.teamId,
      list.map((option) => option.index),
      context.rng
    );
    const pick = list[best];
    return { index: pick.index, note: noteFor(pick.activation) };
  };

  /**
   * A choice inside an action: the planner's answer against the others,
   * from a fork of the game. A fork that does not replay to this very
   * position is never searched; the planner answers.
   */
  const answer = async (context: CoachContext): Promise<CoachChoice> => {
    const { game, point } = context;
    const planned = await policy.choose(context);
    const root = game.fork();
    if (point.candidates.length < 2 || !root) return planned;
    if (stateChecksum(await replay(root)) !== stateChecksum(game)) {
      console.warn("[Search] a fork did not replay; the planner answers");
      return planned;
    }
    const rivals = point.candidates
      .map((_, i) => i)
      .filter((i) => i !== planned.index)
      .slice(0, budget.options - 1);
    const indices = [planned.index, ...rivals];
    const best = await searchAmong(root, point.teamId, indices, context.rng);
    return best === 0 ? planned : { index: indices[best] };
  };

  return {
    name: options.name ?? "search",
    async choose(context: CoachContext): Promise<CoachChoice> {
      const { game, point } = context;
      game.keepForks();
      if (point.phase !== GamePhase.PLAY) return policy.choose(context);
      if (point.pending) return answer(context);
      if (game.ctx.gameService.getState().activePlayer)
        return policy.choose(context);
      return declare(context);
    },
  };
}
