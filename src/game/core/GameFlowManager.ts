import { GameOperation } from "./GameOperation";

/**
 * GameFlowManager - Orchestrator of Recursive Reactions
 *
 * Responsibility:
 * - Manage a Queue of Operations.
 * - Execute them sequentially.
 * - Allow Operations to add NEW Operations to the front of the queue (Reaction).
 * - Listen for "AnimationComplete" signals if running visually.
 *
 * DOES NOT:
 * - Know about specific valid game rules (that's the Operation's job).
 */
/**
 * DelayProvider - Injectable pacing strategy.
 *
 * Browser: real timers so animations can play out.
 * Headless: resolves immediately so games run at full speed.
 */
export type DelayProvider = (ms: number) => Promise<void>;

/** Engine pacing delays still running, for whenEngineQuiet. */
let runningDelays = 0;
const quietWaiters: (() => void)[] = [];

/** Count visual barriers too, so lockstep checks only settled engine state. */
export async function trackEngineWork(work: Promise<void>): Promise<void> {
  runningDelays++;
  try {
    await work;
  } finally {
    runningDelays--;
    if (runningDelays === 0) quietWaiters.splice(0).forEach((wake) => wake());
  }
}

/** False while an online page replays commands it missed. */
let paced = true;

/**
 * Run engine work with every real-time delay skipped. A page that comes
 * back to an online match replays the commands it missed; pacing them
 * would make the coach watch the whole turn again. Delays never change
 * engine state, so the result is the same.
 */
export async function withoutPacing<T>(work: () => Promise<T>): Promise<T> {
  paced = false;
  try {
    return await work();
  } finally {
    paced = true;
  }
}

export const realTimeDelay: DelayProvider = (ms) => {
  if (!paced) return Promise.resolve();
  runningDelays++;
  return new Promise((resolve) =>
    setTimeout(() => {
      runningDelays--;
      resolve();
      if (runningDelays === 0) quietWaiters.splice(0).forEach((wake) => wake());
    }, ms)
  );
};

/**
 * Resolves once no engine pacing delay is running and the code after the
 * last one has run: the state will not change again until something new
 * happens. Online lockstep waits for this before checking or running a
 * command, because the two machines run the same delays at different
 * moments. A decision the engine is paused on is not a delay, so this
 * does not wait for it. Gives up after `maxMs`, which must outlast the
 * longest chain of dice, queued moments and end-of-drive operations.
 */
export async function whenEngineQuiet(maxMs = 30_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (runningDelays > 0) {
      await Promise.race([
        new Promise<void>((resolve) => quietWaiters.push(resolve)),
        new Promise((resolve) => setTimeout(resolve, deadline - Date.now())),
      ]);
    }
    // Let the code that follows the last delay run
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (runningDelays === 0) return;
  }
  console.warn(`[Engine] still pacing after ${maxMs} ms; carrying on`);
}

export const noDelay: DelayProvider = () => Promise.resolve();

export interface FlowContext {
  gameService: import("@/services/interfaces/IGameService").IGameService;
  eventBus: import("@/services/EventBus").IEventBus;
  flowManager: GameFlowManager;
  delay: DelayProvider;
  [key: string]: unknown; // Allow for dynamic context data (use with caution)
}

export class GameFlowManager {
  private queue: GameOperation[] = [];
  private isProcessing: boolean = false;
  private idleResolvers: (() => void)[] = [];
  /** Counts abandons: a run from before one must not touch the flow after. */
  private epoch = 0;
  /** Counts clears: what a chain set aside before one is dropped with it. */
  private clears = 0;
  public readonly context: FlowContext;

  constructor(
    context: Omit<FlowContext, "flowManager" | "delay"> & {
      delay?: DelayProvider;
    }
  ) {
    this.context = context as FlowContext;
    this.context.flowManager = this;
    this.context.delay = context.delay ?? realTimeDelay;
  }

  /**
   * Add an operation to the end of the queue (or front if 'next' is true)
   */
  public add(operation: GameOperation, next: boolean = false): void {
    if (next) {
      this.queue.unshift(operation);
    } else {
      this.queue.push(operation);
    }
    this.process();
  }

  /**
   * Clear all pending operations (e.g. on Turnover or Reset)
   */
  public clear(): void {
    this.queue = [];
    this.clears++;
  }

  /**
   * Forget everything, including an operation paused on a decision that was
   * abandoned: it never resumes, and must not hold up what runs next.
   */
  public abandon(): void {
    this.queue = [];
    this.isProcessing = false;
    this.epoch++;
  }

  /**
   * Resolves once the queue has fully drained (the current reaction chain —
   * bounces, catches, armour rolls — has come to rest). Resolves immediately
   * when nothing is running.
   */
  public whenIdle(): Promise<void> {
    if (!this.isProcessing && this.queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  /**
   * Run an operation and everything it queues, such as a bounce and the
   * catch it lands on, before returning. A chain started in the middle of
   * another step, like a Dump-Off before the block that provoked it, must
   * come to rest before that step goes on. Waiting for idle cannot do it:
   * that step may itself be running inside the queue.
   */
  public async runToRest(operation: GameOperation): Promise<void> {
    const { epoch, clears } = this;
    const later = this.queue;
    const wasProcessing = this.isProcessing;
    this.queue = [operation];
    this.isProcessing = true;
    await this.drain(epoch);
    if (this.epoch !== epoch) return;
    if (this.clears === clears) this.queue.push(...later);
    this.isProcessing = wasProcessing;
    if (!wasProcessing) void this.process();
  }

  private async process(): Promise<void> {
    if (this.isProcessing) return;
    const { epoch } = this;
    this.isProcessing = true;
    await this.drain(epoch);
    if (this.epoch !== epoch) return;
    this.isProcessing = false;

    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    resolvers.forEach((resolve) => resolve());
  }

  private async drain(epoch: number): Promise<void> {
    while (this.epoch === epoch && this.queue.length > 0) {
      const op = this.queue.shift();
      if (op) {
        console.log(`[Flow] Executing: ${op.name}`);
        try {
          // Execute deeply - The Operation determines when it is "done"
          // This allows animations to finish before the next logical step occurs
          await op.execute(this.context);
        } catch (err) {
          console.error(`[Flow] Error in ${op.name}:`, err);
          // Stop flow on error? Or turnover?
          // Ideally operations handle their own errors and trigger turnovers via context
          // An abandoned run failing late must not clear the flow after it
          if (this.epoch === epoch) this.clear();
        }
      }
    }
  }
}
