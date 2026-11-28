import { GameOperation } from "./GameOperation";

export type DelayProvider = (ms: number) => Promise<void>;

const delays = { running: 0 };
const quietWaiters: (() => void)[] = [];

export async function trackEngineWork(work: Promise<void>): Promise<void> {
  delays.running++;
  try {
    await work;
  } finally {
    delays.running--;
    if (delays.running === 0)
      for (const wake of quietWaiters.splice(0)) {
        wake();
      }
  }
}

const pacing = { paced: true };

export async function withoutPacing<T>(work: () => Promise<T>): Promise<T> {
  pacing.paced = false;
  try {
    return await work();
  } finally {
    pacing.paced = true;
  }
}

export function isPaced(): boolean {
  return pacing.paced;
}

export const realTimeDelay: DelayProvider = (ms) => {
  if (!pacing.paced) return Promise.resolve();
  delays.running++;
  return new Promise((resolve) =>
    setTimeout(() => {
      delays.running--;
      resolve();
      if (delays.running === 0)
        for (const wake of quietWaiters.splice(0)) {
          wake();
        }
    }, ms)
  );
};

export async function whenEngineQuiet(maxMs = 30_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (delays.running > 0) {
      await Promise.race([
        new Promise<void>((resolve) => {
          quietWaiters.push(resolve);
        }),
        new Promise((resolve) => setTimeout(resolve, deadline - Date.now())),
      ]);
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    if (delays.running === 0) return;
  }
  console.warn(`[Engine] still pacing after ${String(maxMs)} ms; carrying on`);
}

export const noDelay: DelayProvider = () => Promise.resolve();

export function waitAtMost(
  delay: DelayProvider,
  shown: Promise<void>,
  ms: number
): Promise<void> {
  if (delay !== realTimeDelay) return Promise.race([shown, delay(ms)]);
  if (!pacing.paced) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return trackEngineWork(
    Promise.race([shown, guard]).finally(() => {
      clearTimeout(timer);
    })
  );
}

export function waitForCoach(
  delay: DelayProvider,
  answered: Promise<void>,
  ms: number
): Promise<void> {
  if (delay !== realTimeDelay) return Promise.race([answered, delay(ms)]);
  if (!pacing.paced) return Promise.resolve();
  return answered;
}

export interface FlowContext {
  gameService: import("@/services/interfaces/IGameService").IGameService;
  eventBus: import("@/services/EventBus").IEventBus;
  flowManager: GameFlowManager;
  delay: DelayProvider;
  [key: string]: unknown;
}

export class GameFlowManager {
  private queue: GameOperation[] = [];
  private isProcessing = false;
  private idleResolvers: (() => void)[] = [];

  private epoch = 0;

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

  public add(operation: GameOperation, next = false): void {
    if (next) {
      this.queue.unshift(operation);
    } else {
      this.queue.push(operation);
    }
    this.process();
  }

  public clear(): void {
    this.queue = [];
    this.clears++;
  }

  public abandon(): void {
    this.queue = [];
    this.isProcessing = false;
    this.epoch++;
  }

  public whenIdle(): Promise<void> {
    if (!this.isProcessing && this.queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

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
    do {
      await this.drain(epoch);
    } while (this.epoch === epoch && this.queue.length > 0);
    if (this.epoch !== epoch) return;
    this.isProcessing = false;

    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }

  private async drain(epoch: number): Promise<void> {
    while (this.epoch === epoch && this.queue.length > 0) {
      const op = this.queue.shift();
      if (!op) {
        continue;
      }

      console.log(`[Flow] Executing: ${op.name}`);
      try {
        await op.execute(this.context);
      } catch (error) {
        console.error(`[Flow] Error in ${op.name}:`, error);

        if (this.epoch === epoch) this.clear();
      }
    }
  }
}
