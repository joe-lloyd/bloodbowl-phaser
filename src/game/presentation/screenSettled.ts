import { IEventBus } from "../../services/EventBus";
import { rootEventBus } from "../../services/scopedEventBus";
import { DiceWatch } from "./diceWatch";
import { hasPendingMoments, whenMomentsComplete } from "./momentQueue";

/**
 * What the board is still drawing, by bus: players walking, a ball in the
 * air. The board registers it; a coach the page plays waits on it, so each
 * step it takes is seen before the next starts. With no board (headless
 * runs, unit tests) nothing is registered and every wait ends at once.
 */
const boards = new WeakMap<IEventBus, () => Promise<unknown>>();

/**
 * The board draws for this bus until the returned function is called.
 * `drawn` resolves once everything it has been given has been drawn.
 */
export function drawsFor(
  eventBus: IEventBus,
  drawn: () => Promise<unknown>
): () => void {
  const root = rootEventBus(eventBus);
  boards.set(root, drawn);
  return () => {
    if (boards.get(root) === drawn) boards.delete(root);
  };
}

/** A stalled animation must never stop the match: give up after this. */
const MAX_WAIT_MS = 10_000;

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Resolves once the screen has shown everything it has been given: walks
 * and flights, dice and banners. One can start another, a walk waiting on
 * its dice or a banner on a walk, so it looks again until a pass finds
 * nothing left to wait for.
 */
export async function whenScreenSettled(eventBus: IEventBus): Promise<void> {
  const root = rootEventBus(eventBus);
  const dice = DiceWatch.shared(root);
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const board = boards.get(root)?.() ?? Promise.resolve();
    const drawn = await Promise.race([
      board.then(() => true),
      macrotask().then(() => false),
    ]);
    if (drawn && !hasPendingMoments(root) && !dice.inAir()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      (async () => {
        await whenMomentsComplete(root);
        await dice.landed();
        await board;
      })(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
      }),
    ]);
    clearTimeout(timer);
  }
}
