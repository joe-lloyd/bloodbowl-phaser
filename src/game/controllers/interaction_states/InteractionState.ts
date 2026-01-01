import { IEventBus } from "../../../services/EventBus";
import { IGameService } from "../../../services/interfaces/IGameService";
import { GameplayInteractionController } from "../GameplayInteractionController";
import { DefaultInteractionState } from "./DefaultState";

/**
 * InteractionState - Interface for Interaction Modes
 *
 * Responsibility:
 * - Handle input events (click, hover) for a specific mode (Default, Move, Pass).
 * - Manage highlighting and visualization for that mode.
 */
export interface InteractionState {
  enter(): void;
  exit(): void;
  handleSquareClick(x: number, y: number): Promise<void>;
  handleSquareHover(x: number, y: number): void;
  cancel(): void;
}

export abstract class BaseInteractionState implements InteractionState {
  constructor(
    protected controller: GameplayInteractionController,
    protected gameService: IGameService,
    protected eventBus: IEventBus
  ) {}

  abstract enter(): void;
  abstract exit(): void;
  abstract handleSquareClick(x: number, y: number): Promise<void>;

  handleSquareHover(x: number, y: number): void {
    this.controller.getPitch().highlightHoverSquare(x, y);
  }

  cancel(): void {
    // Default behavior: Return to Default state
    this.controller.setState(
      new DefaultInteractionState(
        this.controller,
        this.gameService,
        this.eventBus
      )
    );
  }
}
