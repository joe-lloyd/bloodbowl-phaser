/**
 * A coach that asks Jev, TypeSafe's System One model, for the strategic
 * call: which player acts next, and how, or whether to end the turn.
 *
 * Code still owns the rules. The heuristic coach shortlists legal
 * candidates and handles every low-level step and dice decision; Jev only
 * picks between options that are already legal, as a typed Choice. Any API
 * failure falls back to the heuristic so a batch never stalls on the network.
 *
 * Recordings store the commands, not Jev's answers, so replaying a Jev
 * match needs no API key.
 */

import { PlayerStatus } from "../../types/Player";
import { Coach, CoachContext } from "../coach";
import { heuristicCoach, rankCandidates } from "./heuristic";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
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

interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

interface SystemOneResponse {
  answers: Record<string, ChoiceAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
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
  const timeoutMs = options.timeoutMs ?? 15000;

  async function ask(context: CoachContext, shortlist: number[]) {
    const criteria: Record<string, string> = {};
    shortlist.forEach((candidateIndex, i) => {
      criteria[`option_${i + 1}`] =
        context.point.candidates[candidateIndex].label;
    });
    const started = Date.now();
    stats.calls++;
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        state: describeBoard(context),
        questions: {
          next: {
            type: "choice",
            instructions:
              "You coach `coaching` in a game of Blood Bowl Sevens (20x11 pitch, 6 turns per half). " +
              "Pick the next action that best improves your chance of scoring or stopping the opponent scoring, " +
              "while avoiding a turnover. In Blood Bowl a coach usually makes safe actions (blocks with more dice, " +
              "moves without dodges) before risky ones, and protects the ball carrier.",
            criteria,
          },
        },
      }),
    });
    stats.totalMs += Date.now() - started;
    if (!response.ok) {
      throw new Error(
        `TypeSafe API ${response.status}: ${(await response.text()).slice(0, 200)}`
      );
    }
    const body = (await response.json()) as SystemOneResponse;
    stats.inputTokens += body.usage?.input_tokens ?? 0;
    stats.outputTokens += body.usage?.output_tokens ?? 0;
    const answer = body.answers.next;
    const picked = Number(answer?.choice?.replace("option_", "")) - 1;
    if (!(picked >= 0 && picked < shortlist.length)) {
      throw new Error(`unexpected choice ${answer?.choice}`);
    }
    return {
      index: shortlist[picked],
      confidence: answer.confidence,
      p: answer.probabilities[answer.choice],
    };
  }

  return {
    name: `jev:${model}`,
    stats,
    async choose(context) {
      const declaring = context.point.candidates.some(
        (c) => c.kind === "declare" || c.kind === "end-turn"
      );
      if (!declaring || context.point.candidates.length < 2) {
        return heuristicCoach.choose(context);
      }
      const scores = rankCandidates(context);
      const order = scores
        .map((_, i) => i)
        .sort((a, b) => scores[b] - scores[a]);
      const shortlist = order.slice(0, SHORTLIST);
      const endTurn = context.point.candidates.findIndex(
        (c) => c.kind === "end-turn"
      );
      if (endTurn >= 0 && !shortlist.includes(endTurn)) shortlist.push(endTurn);
      try {
        const { index, confidence, p } = await ask(context, shortlist);
        return {
          index,
          note: `jev p=${p.toFixed(2)} confidence=${confidence.toFixed(2)}`,
        };
      } catch (error) {
        stats.failures++;
        return {
          index: order[0],
          note: `jev failed, heuristic used: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/** The board as named JSON fields, from the deciding coach's side. */
function describeBoard({ snapshot, point }: CoachContext) {
  const ball = snapshot.ballPosition;
  const describeTeam = (teamIndex: number) => {
    const team = snapshot.teams[teamIndex];
    return {
      name: team.name,
      scores_at_x: teamIndex === 0 ? 19 : 0,
      score: snapshot.score[team.id] ?? 0,
      team_rerolls: team.rerolls,
      players: team.players
        .filter((p) => p.position)
        .map((p) => ({
          player: `${p.positionName} #${p.number}`,
          square: `(${p.position!.x},${p.position!.y})`,
          status:
            p.status === PlayerStatus.ACTIVE
              ? "standing"
              : p.status.toLowerCase(),
          has_ball:
            !!ball && ball.x === p.position!.x && ball.y === p.position!.y,
          already_acted: snapshot.turn.activatedPlayerIds.includes(p.id),
          MA: p.stats.MA,
          ST: p.stats.ST,
          AG: `${p.stats.AG}+`,
          skills: p.skills,
        })),
    };
  };
  const mine = snapshot.teams.findIndex((t) => t.id === point.teamId);
  return {
    coaching: snapshot.teams[mine].name,
    turn: `${snapshot.turn.isHalf2 ? "second" : "first"} half, turn ${snapshot.turn.turnNumber} of 6`,
    ball: ball ? `(${ball.x},${ball.y})` : "off the pitch",
    blitz_used_this_turn: snapshot.turn.hasBlitzed,
    pass_used_this_turn: snapshot.turn.hasPassed,
    my_team: describeTeam(mine),
    opponents: describeTeam(1 - mine),
  };
}
