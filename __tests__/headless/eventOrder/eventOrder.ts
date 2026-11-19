import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import {
  type EmittedEvent,
  type HeadlessCommand,
  type PendingDecision,
} from "../../../src/headless/protocol";
import { defaultAnswer } from "../../../src/network/decisionTimeouts";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { type PlayerPlacement } from "../../../src/types/Scenario";

const DETAIL_FIELDS = ["rollType", "description", "effect", "message"];

const IDENTITY_FIELDS = [
  "type",
  "kind",
  "id",
  "playerId",
  "attackerId",
  "defenderId",
  "targetId",
  "victimId",
  "causerId",
  "passerId",
  "interceptorId",
  "throwerId",
  "thrownPlayerId",
  "chooserTeamId",
  "teamId",
  "status",
  "skill",
  "result",
  "accept",
  "x",
  "y",
  "from",
  "to",
  "position",
  "gridPosition",
  "finalPosition",
  "landingPosition",
];

function show(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") return String(value);
  if (typeof value !== "object" || value === null) return undefined;
  const x: unknown = Reflect.get(value, "x");
  const y: unknown = Reflect.get(value, "y");
  return typeof x === "number" && typeof y === "number"
    ? `${String(x)},${String(y)}`
    : undefined;
}

export function eventOrder(events: EmittedEvent[]): string[] {
  return events.map(({ name, data }) => {
    if (typeof data === "string") return `${name}: ${data}`;
    if (typeof data !== "object" || data === null) return name;
    const details = DETAIL_FIELDS.flatMap((field) => {
      const value: unknown = Reflect.get(data, field);
      return typeof value === "string" ? [value] : [];
    });
    const identity = IDENTITY_FIELDS.flatMap((field) => {
      const value = show(Reflect.get(data, field));
      return value === undefined ? [] : [`${field}=${value}`];
    });
    const parts = [
      ...details,
      ...(identity.length ? [identity.join(" ")] : []),
    ];
    return parts.length ? `${name}: ${parts.join(" | ")}` : name;
  });
}

export type Answer = (pending: PendingDecision) => HeadlessCommand | undefined;

export const acceptAll: Answer = (pending) => {
  if (pending.type === "reaction")
    return { type: "use-reaction", accept: true };
  if (pending.type === "reroll") return { type: "use-reroll", accept: true };
  if (pending.type === "follow-up")
    return { type: "choose-follow-up", followUp: true };
  return undefined;
};

const REPLY_CAP = 40;

export async function playOut(
  game: HeadlessGame,
  commands: HeadlessCommand[],
  answer: Answer = () => undefined
): Promise<string[]> {
  const events: EmittedEvent[] = [];
  const run = async (command: HeadlessCommand) => {
    const response = await game.execute(command);
    if (!response.ok) {
      events.push({
        name: "rejected",
        data: `${command.type}: ${String(response.reason)}`,
      });
    }
    events.push(...response.events);
    return response;
  };
  for (const command of commands) {
    let response = await run(command);
    for (let replies = 0; response.pendingDecision; replies++) {
      const pending = response.pendingDecision;
      if (replies === REPLY_CAP) {
        throw new Error(
          `${pending.type} still pending after ${String(REPLY_CAP)} replies`
        );
      }
      const reply = answer(pending) ?? defaultAnswer(pending);
      if (!reply) throw new Error(`no reply for a ${pending.type} decision`);
      response = await run(reply);
    }
  }
  return eventOrder(events);
}

export const skipKickoffEvent: Answer = (pending) =>
  pending.type === "kickoff-event" ? { type: "kickoff-skip" } : undefined;

export function turnGame({
  seed,
  team1,
  team2,
  ballPosition,
}: {
  seed: number;
  team1: Omit<PlayerPlacement, "playerIndex">[];
  team2: Omit<PlayerPlacement, "playerIndex">[];
  ballPosition: { x: number; y: number };
}): HeadlessGame {
  return new HeadlessGame({
    seed,
    scenario: {
      id: "event-order",
      name: "event-order",
      description: "",
      setup: {
        team1Placements: team1.map((p, playerIndex) => ({ playerIndex, ...p })),
        team2Placements: team2.map((p, playerIndex) => ({ playerIndex, ...p })),
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition,
      },
    },
  });
}

export async function acrossSeeds(
  seeds: number[],
  play: (seed: number) => Promise<string[]>
): Promise<Record<number, string[]>> {
  const bySeed: Record<number, string[]> = {};
  for (const seed of seeds) bySeed[seed] = await play(seed);
  return bySeed;
}

export const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
