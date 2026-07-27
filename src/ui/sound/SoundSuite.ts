import { IEventBus } from "../../services/EventBus";
import { AllEvents, GameEventNames } from "../../types/events";
import { GamePhase } from "../../types/GameState";
import { PlayerStatus } from "../../types/Player";
import { CATALOG, SoundName } from "./catalog";
import { SoundManager } from "./SoundManager";
import { soundSettings } from "./settings";

type Unsubscribe = () => void;

/** How long a higher-priority sound suppresses lower-priority ones that land right after it. */
const PRIORITY_LOCK_MS = 600;

/**
 * Binds domain events on the shared EventBus to catalog sounds. The engine
 * never references sound; every mapping here is one line of data, and the
 * whole class can be mounted/disposed freely without touching gameplay code.
 */
export class SoundSuite {
  private unsubs: Unsubscribe[] = [];
  private lastPlayedAt = new Map<SoundName, number>();
  private priorityLockUntil = 0;
  private priorityLockLevel = -Infinity;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly manager: SoundManager
  ) {}

  mount(): void {
    this.bind(GameEventNames.DiceRoll, () => "diceRoll");
    this.bind(GameEventNames.BlockDiceRolled, () => "blockImpact");
    this.bind(GameEventNames.PlayerPushedIntoCrowd, () => "pushback");
    this.bind(GameEventNames.PlayerKnockedDown, () => "knockdown");
    this.bind(GameEventNames.BallKicked, () => "kickoff");
    this.bind(GameEventNames.BallScattered, () => "ballBounce");
    this.bind(GameEventNames.CatchSucceeded, () => "catch");
    this.bind(GameEventNames.CatchFailed, () => "fumble");
    this.bind(GameEventNames.BallPickup, (data) =>
      data.success ? null : "fumble"
    );
    this.bind(GameEventNames.PassFumbled, () => "fumble");
    this.bind(GameEventNames.PassAttempted, () => "pass");
    this.bind(GameEventNames.Turnover, () => "turnoverWhistle");
    this.bind(GameEventNames.Touchdown, () => "touchdown");
    this.bind(GameEventNames.PlayerStatusChanged, (player) => {
      if (player.status === PlayerStatus.REMOVED) return "sendOff";
      if (player.status === PlayerStatus.KO || player.status === PlayerStatus.INJURED) {
        return "koInjury";
      }
      return null;
    });
    this.bind(GameEventNames.PlayerCasualtyInflicted, (data) =>
      data.cause === "special" ? "foul" : "koInjury"
    );
    this.bind(GameEventNames.DriveEnded, (data) =>
      data.reason === "halftime" ? "endOfHalf" : null
    );
    this.bind(GameEventNames.PhaseChanged, (data) =>
      data.phase === GamePhase.GAME_OVER ? "endOfHalf" : null
    );
    this.bind(GameEventNames.UI_ActionSelected, () => "uiClick");
  }

  dispose(): void {
    this.unsubs.forEach((unsub) => unsub());
    this.unsubs = [];
  }

  /** Play a catalog entry directly — used by the audition board, bypassing event bindings. */
  play(name: SoundName): void {
    this.trigger(name);
  }

  private bind<K extends keyof AllEvents>(
    event: K,
    resolve: (data: AllEvents[K]) => SoundName | null
  ): void {
    const handler = (data: AllEvents[K]) => {
      const name = resolve(data);
      if (name) this.trigger(name);
    };
    this.eventBus.on(event, handler);
    this.unsubs.push(() => this.eventBus.off(event, handler));
  }

  private trigger(name: SoundName): void {
    const settings = soundSettings.get();
    if (settings.muted) return;

    const entry = CATALOG[name];
    const now = Date.now();

    const last = this.lastPlayedAt.get(name) ?? 0;
    if (now - last < entry.minRetriggerMs) return;

    if (now < this.priorityLockUntil && entry.priority < this.priorityLockLevel) {
      return;
    }

    this.lastPlayedAt.set(name, now);
    this.priorityLockUntil = now + PRIORITY_LOCK_MS;
    this.priorityLockLevel = entry.priority;

    if (entry.sampleUrl) {
      this.playSample(entry.sampleUrl, entry.gain * settings.volume);
      return;
    }

    this.manager.playOneShot(
      entry.build().gain(entry.gain * settings.volume),
      entry.durationMs
    );
  }

  private playSample(url: string, volume: number): void {
    try {
      const audio = new Audio(url);
      audio.volume = Math.min(1, Math.max(0, volume));
      void audio.play();
    } catch (e) {
      console.error("SoundSuite: Error playing sample", e);
    }
  }
}
