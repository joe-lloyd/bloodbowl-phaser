import { type IEventBus } from "../../services/EventBus";
import { rootEventBus } from "../../services/scopedEventBus";
import { DiceWatch } from "./diceWatch";
import { hasMomentsToShow, whenMomentsShown } from "./momentQueue";

const boards = new WeakMap<IEventBus, () => Promise<unknown>>();

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

const MAX_WAIT_MS = 10_000;

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    if (drawn && !hasMomentsToShow(root) && !dice.inAir()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      (async () => {
        await whenMomentsShown(root);
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
