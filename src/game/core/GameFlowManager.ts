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
export interface FlowContext {
  gameService: import("@/services/interfaces/IGameService").IGameService;
  eventBus: import("@/services/EventBus").IEventBus;
  flowManager: GameFlowManager;
  [key: string]: any; // Allow for dynamic context data (use with caution)
}

export class GameFlowManager {
  private queue: GameOperation[] = [];
  private isProcessing: boolean = false;
  private context: FlowContext;

  constructor(context: Omit<FlowContext, "flowManager">) {
    this.context = context as FlowContext;
    this.context.flowManager = this;
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
  }

  private async process(): Promise<void> {
    if (this.isProcessing) return;
    if (this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
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
          this.clear();
        }
      }
    }

    this.isProcessing = false;
  }
}
