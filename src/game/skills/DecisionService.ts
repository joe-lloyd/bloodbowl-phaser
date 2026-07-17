/**
 * DecisionService - the one channel for mid-action coach decisions that
 * pause a roll path (reroll offers now; reactions next).
 *
 * A roll path awaits request(); the engine emits DecisionRequested so a
 * front end can surface it (browser dialog, headless pendingDecision); the
 * answer — from the dialog or a protocol reply — resolves the promise and
 * the paused path resumes. One decision at a time, matching the existing
 * pendingDecision gating.
 */

import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { DecisionRequest, DecisionAnswer } from "../../types/decisions";

export class DecisionService {
  private current: {
    request: DecisionRequest;
    resolve: (answer: DecisionAnswer) => void;
  } | null = null;

  constructor(private eventBus: IEventBus) {}

  public pending(): DecisionRequest | null {
    return this.current?.request ?? null;
  }

  public request(request: DecisionRequest): Promise<DecisionAnswer> {
    if (this.current) {
      // Roll paths pause on their decision, so two at once is a bug upstream
      return Promise.reject(
        new Error(`decision-already-pending:${this.current.request.type}`)
      );
    }
    const promise = new Promise<DecisionAnswer>((resolve) => {
      this.current = { request, resolve };
    });
    this.eventBus.emit(GameEventNames.DecisionRequested, request);
    return promise;
  }

  /** Resolve the pending decision; false when nothing is pending. */
  public answer(answer: DecisionAnswer): boolean {
    if (!this.current) return false;
    const { resolve } = this.current;
    this.current = null;
    resolve(answer);
    return true;
  }
}
