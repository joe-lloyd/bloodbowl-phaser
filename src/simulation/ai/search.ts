import { stateChecksum } from "../../headless/checksum";
import { type GameFork, HeadlessGame } from "../../headless/HeadlessGame";
import { GamePhase, type GameState } from "../../types/GameState";
import { type Candidate, enumerateDecision } from "../candidates";
import { type Coach, type CoachChoice, type CoachContext } from "../coach";
import { type CoachRng, createCoachRng } from "../rng";
import { type Activation, activations, planIdentity } from "./activations";
import { readBoard } from "./board";
import { evaluate } from "./evaluate";
import {
  availableActions,
  createPlannerCoach,
  declarationIndex,
  noteFor,
} from "./planner";
import { DEFAULT_WEIGHTS, type Weights } from "./weights";

export interface SearchBudget {
  samples: number;

  options: number;

  deadlineMs?: number;
}

export const BUDGETS = {
  hard: { samples: 8, options: 4, deadlineMs: 1500 },
  legend: { samples: 16, options: 4, deadlineMs: 4000 },
} as const satisfies Record<string, SearchBudget>;

interface Option {
  index: number;
  activation: Activation;
}

const PLAYOUT_COMMANDS = 200;

function shortlist(context: CoachContext, w: Weights, size: number): Option[] {
  const { game, point } = context;
  const board = readBoard(game, point.teamId);
  const out: Option[] = [];
  const seen = new Set<string>();
  for (const activation of activations({
    board: board,
    w: w,
    available: availableActions(point.candidates),
  })) {
    const id = planIdentity(activation);
    if (seen.has(id)) continue;
    seen.add(id);
    const index = declarationIndex(point.candidates, activation);
    if (index >= 0) out.push({ index, activation });
    if (out.length >= size) break;
  }
  return out;
}

async function replay(root: GameFork): Promise<HeadlessGame> {
  const game = new HeadlessGame({ matchSave: root.save, lazySnapshots: true });
  for (const command of root.since) await game.execute(command);
  return game;
}

interface ScorePlayoutArgs {
  root: GameFork;
  us: string;
  index: number;
  seed: number;
  w?: Weights | undefined;
  openingPlan?: Activation | undefined;
}

export async function scorePlayout({
  root,
  us,
  index,
  seed,
  w = DEFAULT_WEIGHTS,
  openingPlan,
}: ScorePlayoutArgs): Promise<number> {
  const game = await replay(root);
  const dice = game.ctx.rng.captureState();
  game.ctx.rng.restoreState({ ...dice, currentSeed: seed });
  const startScore = { ...game.ctx.gameService.getState().score };
  const first = await enumerateDecision(game, null);
  const opening = first.candidates[index];
  if (opening) await game.execute(opening.commands[0]);

  const policy = createPlannerCoach({ weights: w });
  if (openingPlan) policy.remember(game, openingPlan);

  const rng = createCoachRng(sampleSeed(seed, index));
  await finishPlayout({ game, us, startScore, policy, rng });
  return evaluate(readBoard(game, us));
}

interface FinishPlayoutArgs {
  game: HeadlessGame;
  us: string;
  startScore: GameState["score"];
  policy: Coach;
  rng: CoachRng;
}

async function finishPlayout({
  game,
  us,
  startScore,
  policy,
  rng,
}: FinishPlayoutArgs): Promise<void> {
  let handedOver = false;
  for (let steps = 0; steps < PLAYOUT_COMMANDS; steps++) {
    if (game.ctx.gameService.getState().activeTeamId !== us) handedOver = true;
    if (
      playoutOver({
        game: game,
        us: us,
        startScore: startScore,
        handedOver: handedOver,
      })
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
    const candidate = point.candidates[index];
    if (!candidate)
      throw new RangeError(`Coach selected missing candidate ${String(index)}`);
    if (await executeCandidate(game, candidate)) break;
  }
}

interface PlayoutOverArgs {
  game: HeadlessGame;
  us: string;
  startScore: GameState["score"];
  handedOver: boolean;
}

function playoutOver({
  game,
  us,
  startScore,
  handedOver,
}: PlayoutOverArgs): boolean {
  const state = game.ctx.gameService.getState();
  const scored = Object.keys(startScore).some(
    (t) => (state.score[t] ?? 0) !== startScore[t]
  );
  return (
    scored ||
    state.phase !== GamePhase.PLAY ||
    (handedOver && state.activeTeamId === us && !game.pendingDecision())
  );
}

const sampleSeed = (base: number, sample: number) =>
  (Math.imul(base ^ (sample + 1), 0x9e3779b1) >>> 0) % 2_147_483_647 || 1;

export interface PlayoutRound {
  root: GameFork;
  us: string;
  indices: number[];
  plans?: Activation[];
  seeds: number[];

  deadlineAt?: number;
}

export type Playouts = (round: PlayoutRound) => Promise<number[][]>;

function playoutsHere(w: Weights): Playouts {
  return async ({ root, us, indices, seeds, deadlineAt, plans }) => {
    const late = () => deadlineAt !== undefined && Date.now() > deadlineAt;
    const rows: number[][] = [];
    for (const seed of seeds) {
      const row: number[] = [];
      for (const [k, index] of indices.entries()) {
        if (late()) return rows;
        row.push(
          await scorePlayout({
            root: root,
            us: us,
            index: index,
            seed: seed,
            w: w,
            openingPlan: plans?.[k],
          })
        );
      }
      rows.push(row);
    }
    return rows;
  };
}

interface SearchCoachOptions {
  weights?: Weights;
  name?: string;
  budget: SearchBudget;
  playouts?: Playouts;
}

interface SearchEnvironment {
  budget: SearchBudget;
  playouts: Playouts;
}

interface SearchContext {
  root: GameFork;
  us: string;
  rng: CoachRng;
}

interface SearchOption {
  index: number;
  activation?: Activation;
}

interface ScoredOption<T> {
  option: T;
  total: number;
  count: number;
}

const mean = (scored: Pick<ScoredOption<unknown>, "total" | "count">) =>
  scored.count ? scored.total / scored.count : -Infinity;

function betterHalf<T>(
  alive: ScoredOption<T>[],
  baseline: ScoredOption<T>
): ScoredOption<T>[] {
  const kept = alive
    .toSorted((a, b) => mean(b) - mean(a))
    .slice(0, Math.max(1, alive.length >> 1));
  if (!kept.includes(baseline) && kept.length > 0) kept.push(baseline);
  return kept;
}

function addRoundScores(
  alive: Pick<ScoredOption<unknown>, "total" | "count">[],
  rows: number[][]
): void {
  for (const row of rows)
    for (const [column, option] of alive.entries()) {
      const score = row[column];
      if (score === undefined)
        throw new RangeError("Playout result omitted an option score");
      option.total += score;
      option.count++;
    }
}

function playoutRound(
  context: SearchContext,
  alive: ScoredOption<SearchOption>[],
  timing: { seeds: number[]; deadlineAt: number | undefined }
): PlayoutRound {
  const plans = alive.flatMap(({ option }) =>
    option.activation ? [option.activation] : []
  );
  return {
    root: context.root,
    us: context.us,
    indices: alive.map(({ option }) => option.index),
    seeds: timing.seeds,
    ...(timing.deadlineAt !== undefined && { deadlineAt: timing.deadlineAt }),
    ...((plans.length === alive.length) && { plans }),
  };
}

async function searchAmong<T extends SearchOption>(
  context: SearchContext,
  options: readonly [T, ...T[]],
  { budget, playouts }: SearchEnvironment
): Promise<T> {
  const deadlineAt =
    budget.deadlineMs === undefined
      ? undefined
      : Date.now() + budget.deadlineMs;
  const late = () => deadlineAt !== undefined && Date.now() > deadlineAt;
  const base = context.rng.int(2_147_483_647);
  const baseline: ScoredOption<T> = { option: options[0], total: 0, count: 0 };
  let alive = [
    baseline,
    ...options.slice(1).map((option) => ({ option, total: 0, count: 0 })),
  ];
  let sampleAt = 0;
  for (let round = 0; alive.length > 1 && !late(); round++) {
    const samples = round === 0 ? budget.samples : budget.samples * 2;
    const seeds = Array.from({ length: samples }, () =>
      sampleSeed(base, sampleAt++)
    );
    const rows = await playouts(
      playoutRound(context, alive, { seeds, deadlineAt })
    );
    addRoundScores(alive, rows);
    if (rows.length < seeds.length) break;
    alive = betterHalf(alive, baseline);
    if (alive.length === 2 && round > 0) break;
  }
  const rival = alive.toSorted((a, b) => mean(b) - mean(a))[0] ?? baseline;
  return mean(rival) > mean(baseline) ? rival.option : baseline.option;
}

interface SearchPolicy {
  policy: ReturnType<typeof createPlannerCoach>;
  weights: Weights;
  environment: SearchEnvironment;
}

async function declareSearch(
  context: CoachContext,
  { policy, weights, environment }: SearchPolicy
): Promise<CoachChoice> {
  const { game, point } = context;
  const [first, ...rest] = shortlist(
    context,
    weights,
    environment.budget.options
  );
  if (!first || rest.length === 0) return policy.choose(context);
  const pick = await searchAmong(
    {
      root: { save: game.matchSave(), since: [] },
      us: point.teamId,
      rng: context.rng,
    },
    [first, ...rest],
    environment
  );
  policy.remember(game, pick.activation);
  return { index: pick.index, note: noteFor(pick.activation) };
}

async function answerSearch(
  context: CoachContext,
  { policy, environment }: SearchPolicy
): Promise<CoachChoice> {
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
    .slice(0, environment.budget.options - 1)
    .map((index) => ({ index }));
  const best = await searchAmong(
    { root, us: point.teamId, rng: context.rng },
    [{ index: planned.index }, ...rivals],
    environment
  );
  return best.index === planned.index ? planned : { index: best.index };
}

export function createSearchCoach(options: SearchCoachOptions): Coach {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const search = {
    policy: createPlannerCoach({ weights }),
    weights,
    environment: {
      budget: options.budget,
      playouts: options.playouts ?? playoutsHere(weights),
    },
  };
  return {
    name: options.name ?? "search",
    async choose(context: CoachContext): Promise<CoachChoice> {
      const { game, point } = context;
      game.keepForks();
      if (point.phase !== GamePhase.PLAY) return search.policy.choose(context);
      if (point.pending) return answerSearch(context, search);
      if (game.ctx.gameService.getState().activePlayer)
        return search.policy.choose(context);
      return declareSearch(context, search);
    },
  };
}

async function executeCandidate(
  game: HeadlessGame,
  candidate: Candidate
): Promise<boolean> {
  let refused = false;
  for (const command of candidate.commands) {
    const result = await game.execute(command);
    refused ||= !result.ok;
  }
  return refused;
}
