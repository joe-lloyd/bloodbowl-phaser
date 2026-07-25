import { IEventBus } from "../../services/EventBus";
import { IGameService } from "../../services/interfaces/IGameService";
import { GameEventNames } from "../../types/events";
import { MatchSave } from "../../headless/serialization";
import { MatchSaveRepository, writeMatchSave } from "./MatchSaveRepository";

export interface MatchAutosaveOptions {
  enabled?: boolean;
  debounceMs?: number;
  repository?: MatchSaveRepository;
}

/**
 * One boundary observer for local play. It waits for the operation queue to
 * drain and refuses to persist while a decision is pending.
 */
export class MatchAutosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private revision = 0;
  private readonly boundaryHandler = () => this.schedule();
  private readonly watchedEvents = [
    GameEventNames.GameStateChanged,
    GameEventNames.ActionResolved,
    GameEventNames.TurnEnded,
    GameEventNames.PhaseChanged,
    GameEventNames.DriveEnded,
  ] as const;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly gameService: IGameService,
    private readonly buildSave: () => MatchSave,
    private readonly options: MatchAutosaveOptions = {}
  ) {}

  start(): void {
    if (this.options.enabled === false || this.disposed) return;
    this.watchedEvents.forEach((event) => {
      this.eventBus.on(event, this.boundaryHandler as never);
    });
    this.schedule();
  }

  schedule(): void {
    if (this.options.enabled === false || this.disposed) return;
    this.revision++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => void this.flushRevision(this.revision),
      this.options.debounceMs ?? 75
    );
  }

  async flushNow(): Promise<boolean> {
    if (this.options.enabled === false || this.disposed) return false;
    this.revision++;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.flushRevision(this.revision);
  }

  private async flushRevision(revision: number): Promise<boolean> {
    await this.gameService.getFlowContext().flowManager.whenIdle();
    if (this.disposed || revision !== this.revision) return false;
    if (this.gameService.getDecisionService().pending()) {
      this.schedule();
      return false;
    }
    const save = this.buildSave();
    if (this.options.repository) {
      this.options.repository.write(save);
    } else {
      writeMatchSave(save);
    }
    return true;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.watchedEvents.forEach((event) => {
      this.eventBus.off(event, this.boundaryHandler as never);
    });
  }
}
