import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import {
  EmittedEvent,
  HeadlessCommand,
  PendingDecision,
} from "../../../src/headless/protocol";
import { defaultAnswer } from "../../../src/network/decisionTimeouts";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { PlayerPlacement } from "../../../src/types/Scenario";

/** Fields that tell two events of one name apart in an order assertion. */
const DETAIL_FIELDS = ["rollType", "description", "effect", "message"];

/**
 * One line per event: its name, then the text that says what happened. A
 * test asserts the list literally, so any reordered roll, emit or queued
 * operation fails it.
 */
export function eventOrder(events: EmittedEvent[]): string[] {
  return events.map(({ name, data }) => {
    if (typeof data === "string") return `${name}: ${data}`;
    if (typeof data !== "object" || data === null) return name;
    const details = DETAIL_FIELDS.flatMap((field) => {
      const value: unknown = Reflect.get(data, field);
      return typeof value === "string" ? [value] : [];
    });
    return details.length ? `${name}: ${details.join(" | ")}` : name;
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

/**
 * Run each command, answering every decision it opens, and return the
 * event order of all of it. A rejected command shows as one line.
 */
export async function playOut(
  game: HeadlessGame,
  commands: HeadlessCommand[],
  answer: Answer = () => undefined
): Promise<string[]> {
  const events: EmittedEvent[] = [];
  for (const command of commands) {
    let response = await game.execute(command);
    if (!response.ok) {
      events.push({ name: "rejected", data: `${command.type}: ${response.reason}` });
    }
    events.push(...response.events);
    for (let guard = 0; response.pendingDecision && guard < 40; guard++) {
      const pending = response.pendingDecision;
      const reply = answer(pending) ?? defaultAnswer(pending);
      if (!reply) break;
      response = await game.execute(reply);
      events.push(...response.events);
    }
  }
  return eventOrder(events);
}

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
