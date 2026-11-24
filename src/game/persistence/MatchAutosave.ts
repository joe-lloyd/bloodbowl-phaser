import { whenEngineQuiet } from "../core/GameFlowManager";
import { type IEventBus } from "../../services/EventBus";
import { type IGameService } from "../../services/interfaces/IGameService";
import { GameEventNames } from "../../types/events";
import { type MatchSave } from "../../headless/serialization";
import {
  type MatchSaveRepository,
  writeMatchSave,
} from "./MatchSaveRepository";

export interface MatchAutosaveOptions {
  enabled?: boolean;
  debounceMs?: number;
  repository?: MatchSaveRepository;

  choiceOpen?: () => boolean;
}

export class MatchAutosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private revision = 0;
  private readonly boundaryHandler = () => {
    this.schedule();
  };
  private readonly watchedEvents = [
    GameEventNames.GameStateChanged,
    GameEventNames.UI_SyncBoard,
    GameEventNames.ActionResolved,
    GameEventNames.TurnEnded,
    GameEventNames.PhaseChanged,
    GameEventNames.DriveEnded,

    GameEventNames.MvpAwarded,
    GameEventNames.AwardedTouchdownAssigned,
    GameEventNames.MatchSppApplied,
  ] as const;

  private readonly eventBus: IEventBus;
  private readonly gameService: IGameService;
  private readonly buildSave: () => MatchSave;
  private readonly options: MatchAutosaveOptions;
  constructor(
    eventBus: IEventBus,
    gameService: IGameService,
    buildSave: () => MatchSave,
    options: MatchAutosaveOptions = {}
  ) {
    this.eventBus = eventBus;
    this.gameService = gameService;
    this.buildSave = buildSave;
    this.options = options;
  }

  start(): void {
    if (this.options.enabled === false || this.disposed) return;
    this.watchedEvents.forEach((event) => {
      this.eventBus.on(event, this.boundaryHandler);
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
    await whenEngineQuiet();
    if (this.disposed || revision !== this.revision) return false;
    if (this.midChoice()) {
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

  private kickBetweenTurns(): boolean {
    return (
      this.gameService.kickInTheAir() !== null &&
      !this.gameService.getKickoffEventStep()
    );
  }

  private midChoice(): boolean {
    return (
      this.gameService.getDecisionService().pending() !== null ||
      this.gameService.captureTurnManagerState().turnoverInProgress ||
      this.gameService.isKickoffTableResolving() ||
      this.kickBetweenTurns() ||
      this.options.choiceOpen?.() === true
    );
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.watchedEvents.forEach((event) => {
      this.eventBus.off(event, this.boundaryHandler);
    });
  }
}
