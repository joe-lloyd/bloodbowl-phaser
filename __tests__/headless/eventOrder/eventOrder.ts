import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import {
  EmittedEvent,
  HeadlessCommand,
  PendingDecision,
} from "../../../src/headless/protocol";
import { defaultAnswer } from "../../../src/network/decisionTimeouts";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { PlayerPlacement } from "../../../src/types/Scenario";

/** Text fields that say what happened. */
const DETAIL_FIELDS = ["rollType", "description", "effect", "message"];

/**
 * Fields that say who acted, on which decision, and where: player and team
 * ids, the decision's type, and squares. Two events of one name with
 * different players or squares project to different lines.
 */
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

/** A square as "x,y"; any other value as itself when it is a scalar. */
function show(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") return String(value);
  if (typeof value !== "object" || value === null) return undefined;
  const x: unknown = Reflect.get(value, "x");
  const y: unknown = Reflect.get(value, "y");
  return typeof x === "number" && typeof y === "number"
    ? `${x},${y}`
    : undefined;
}

/**
 * One line per event: its name, the text that says what happened, then who
 * and where. A test asserts the list literally, so a reordered roll, emit,
 * queued operation or decision fails it, and so does the same event moving
 * to a different player or square.
 */
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

/** A reply to a decision, or undefined to answer as a timed-out coach. */
export type Answer = (pending: PendingDecision) => HeadlessCommand | undefined;

/** Accept every optional skill and re-roll; follow up every push. */
export const acceptAll: Answer = (pending) => {
  switch (pending.type) {
    case "reaction":
      return { type: "use-reaction", accept: true };
    case "reroll":
      return { type: "use-reroll", accept: true };
    case "follow-up":
      return { type: "choose-follow-up", followUp: true };
    default:
      return undefined;
  }
};

/** Most replies one command may need before its decisions are settled. */
const REPLY_CAP = 40;

/**
 * Run each command, answering every decision it opens, and return the
 * event order of all of it. A rejected command or reply shows as one line.
 * Throws when a decision has no reply, or is still open after the cap, so
 * a snapshot never holds a trace that stopped part-way.
 */
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
        data: `${command.type}: ${response.reason}`,
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
          `${pending.type} still pending after ${REPLY_CAP} replies`
        );
      }
      const reply = answer(pending) ?? defaultAnswer(pending);
      if (!reply) throw new Error(`no reply for a ${pending.type} decision`);
      response = await run(reply);
    }
  }
  return eventOrder(events);
}

/** Skip the kick-off event, as the rule catalog does. */
export const skipKickoffEvent: Answer = (pending) =>
  pending.type === "kickoff-event" ? { type: "kickoff-skip" } : undefined;

/** A game in team1's turn with these players on the pitch. */
export function turnGame(
  seed: number,
  team1: Omit<PlayerPlacement, "playerIndex">[],
  team2: Omit<PlayerPlacement, "playerIndex">[],
  ballPosition: { x: number; y: number }
): HeadlessGame {
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

/**
 * The same play across several seeds, keyed by seed, so one snapshot pins
 * the order down every branch those seeds reach.
 */
export async function acrossSeeds(
  seeds: number[],
  play: (seed: number) => Promise<string[]>
): Promise<Record<number, string[]>> {
  const bySeed: Record<number, string[]> = {};
  for (const seed of seeds) bySeed[seed] = await play(seed);
  return bySeed;
}

export const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
