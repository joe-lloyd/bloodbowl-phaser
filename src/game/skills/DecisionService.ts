import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import {
  type DecisionRequest,
  type DecisionAnswer,
  type RerollDecisionRequest,
  type RerollDecisionAnswer,
  type InterceptionDecisionRequest,
  type InterceptionDecisionAnswer,
} from "../../types/decisions";

export class DecisionService {
  private current: {
    request: DecisionRequest;
    resolve: (answer: DecisionAnswer) => void;
  } | null = null;

  private closers: ((answered: boolean) => void)[] = [];

  private eventBus: IEventBus;
  constructor(eventBus: IEventBus) {
    this.eventBus = eventBus;
  }

  public whenClosed(): Promise<boolean> {
    if (!this.current) return Promise.resolve(true);
    return new Promise((resolve) => this.closers.push(resolve));
  }

  private close(answered: boolean): void {
    const closers = this.closers;
    this.closers = [];
    closers.forEach((close) => {
      close(answered);
    });
  }

  public pending(): DecisionRequest | null {
    return this.current?.request ?? null;
  }

  public request(request: RerollDecisionRequest): Promise<RerollDecisionAnswer>;
  public request(
    request: InterceptionDecisionRequest
  ): Promise<InterceptionDecisionAnswer>;
  public request(request: DecisionRequest): Promise<DecisionAnswer>;
  public request(request: DecisionRequest): Promise<DecisionAnswer> {
    if (this.current) {
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

  public seed(
    request: DecisionRequest,
    onAnswer: (answer: DecisionAnswer) => void
  ): void {
    this.current = { request, resolve: onAnswer };
  }

  public abandon(): void {
    this.current = null;
    this.close(false);
  }

  public answer(answer: DecisionAnswer): boolean {
    if (!this.current) return false;
    const { request, resolve } = this.current;
    this.current = null;

    this.eventBus.emit(GameEventNames.DecisionResolved, { type: request.type });
    resolve(answer);
    this.close(true);
    return true;
  }
}
