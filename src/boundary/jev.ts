import { z } from "zod";

const probabilitiesSchema = z.record(z.string(), z.number());
const nextAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number(),
  probabilities: probabilitiesSchema,
});
const responseSchema = z.object({
  answers: z.object({ next: nextAnswerSchema }),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});

interface ChoiceRequest {
  apiKey: string;
  timeoutMs: number;
  model: string;
  state: unknown;
  criteria: Record<string, string>;
}

const instructions =
  "You coach `coaching` in a game of Blood Bowl Sevens (20x11 pitch, 6 turns per half). " +
  "Pick the next action that best improves your chance of scoring or stopping the opponent scoring, " +
  "while avoiding a turnover. In Blood Bowl a coach usually makes safe actions (blocks with more dice, " +
  "moves without dodges) before risky ones, and protects the ball carrier.";

export async function requestCoachChoice(request: ChoiceRequest) {
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(request.timeoutMs),
    body: JSON.stringify({
      model: request.model,
      state: request.state,
      questions: { next: { type: "choice", instructions, criteria: request.criteria } },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TypeSafe API ${String(response.status)}: ${text.slice(0, 200)}`);
  }
  const value: unknown = await response.json();
  const body = responseSchema.parse(value);
  const answer = body.answers.next;
  const probability = answer.probabilities[answer.choice];
  if (probability === undefined) throw new Error("Chosen option has no probability");
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    probability,
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}
