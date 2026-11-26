import { requestCoachChoice } from "../../boundary/jev";
import { type Coach, type CoachContext } from "../coach";
import { describeBoard } from "./jevBoard";
import { heuristicCoach, rankCandidates } from "./heuristic";

const SHORTLIST = 8;

export interface JevStats {
  calls: number;
  failures: number;
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface JevCoachOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

type RankedCandidate = ReturnType<typeof rankCandidates>[number];
type RequestOptions = Required<JevCoachOptions>;

function shortlistFor(context: CoachContext): RankedCandidate[] {
  const ranked = [...rankCandidates(context)].sort((a, b) => b.score - a.score);
  const shortlist = ranked.slice(0, SHORTLIST);
  const endTurn = ranked.find((entry) => entry.candidate.kind === "end-turn");
  if (endTurn && !shortlist.includes(endTurn)) shortlist.push(endTurn);
  return shortlist;
}

async function ask(request: {
  context: CoachContext;
  shortlist: RankedCandidate[];
  options: RequestOptions;
  stats: JevStats;
}) {
  const { context, shortlist, options, stats } = request;
  const criteria = Object.fromEntries(
    shortlist.map((entry, index) => [
      `option_${String(index + 1)}`,
      entry.candidate.label,
    ])
  );
  const started = Date.now();
  stats.calls++;
  const answer = await requestCoachChoice({
    ...options,
    state: describeBoard(context),
    criteria,
  });
  stats.totalMs += Date.now() - started;
  stats.inputTokens += answer.inputTokens;
  stats.outputTokens += answer.outputTokens;
  const picked = Number(answer.choice.replace("option_", "")) - 1;
  const candidate = shortlist[picked];
  if (!candidate) throw new Error(`unexpected choice ${answer.choice}`);
  return {
    index: candidate.index,
    note: `jev p=${answer.probability.toFixed(2)} confidence=${answer.confidence.toFixed(2)}`,
  };
}

function usesModel(context: CoachContext): boolean {
  return (
    context.point.candidates.length >= 2 &&
    context.point.candidates.some(
      (candidate) =>
        candidate.kind === "declare" || candidate.kind === "end-turn"
    )
  );
}

export function createJevCoach(
  options: JevCoachOptions
): Coach & { stats: JevStats } {
  const stats: JevStats = {
    calls: 0,
    failures: 0,
    totalMs: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  const model = options.model ?? "jev-latest";
  const settings = {
    apiKey: options.apiKey,
    model,
    timeoutMs: options.timeoutMs ?? 15_000,
  };
  return {
    name: `jev:${model}`,
    stats,
    async choose(context) {
      if (!usesModel(context)) return heuristicCoach.choose(context);
      const shortlist = shortlistFor(context);
      try {
        return await ask({ context, shortlist, options: settings, stats });
      } catch (error) {
        stats.failures++;
        return {
          index: shortlist[0]?.index ?? 0,
          note: `jev failed, heuristic used: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
