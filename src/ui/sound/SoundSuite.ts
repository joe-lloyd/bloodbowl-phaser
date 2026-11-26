import { type IEventBus } from "../../services/EventBus";
import { type AllEvents, GameEventNames } from "../../types/events";
import { GamePhase } from "../../types/GameState";
import { PlayerStatus } from "../../types/Player";
import { CATALOG, type SoundName } from "./catalog";
import { SoundManager } from "./SoundManager";
import { soundSettings } from "./settings";
import { isThrownIn3D } from "../dice/thrownDice";

type Unsubscribe = () => void;

const PRIORITY_LOCK_MS = 600;

export class SoundSuite {
  private unsubs: Unsubscribe[] = [];
  private lastPlayedAt = new Map<SoundName, number>();
  private priorityLockUntil = 0;
  private priorityLockLevel = -Infinity;

  private readonly eventBus: IEventBus;
  private readonly manager: SoundManager;
  constructor(eventBus: IEventBus, manager: SoundManager) {
    this.eventBus = eventBus;
    this.manager = manager;
  }

  mount(): void {
    this.bind(GameEventNames.DiceRoll, (roll) =>
      isThrownIn3D(roll.diceType) ? null : "diceRoll"
    );
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
      if (
        player.status === PlayerStatus.KO ||
        player.status === PlayerStatus.INJURED
      ) {
        return "koInjury";
      }
      return null;
    });
    this.bind(GameEventNames.PlayerCasualtyInflicted, (data) =>
      data.cause === "special" || data.cause === "foul"
        ? "foul" : "koInjury"
    );
    this.bind(GameEventNames.DriveEnded, (data) =>
      data.reason === "halftime" ? "endOfHalf" : null
    );
    this.bind(GameEventNames.PhaseChanged, (data) =>
      data.phase === GamePhase.GAME_OVER ? "endOfHalf" : null
    );
  }

  dispose(): void {
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
  }

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
    this.unsubs.push(() => {
      this.eventBus.off(event, handler);
    });
  }

  private trigger(name: SoundName): void {
    const settings = soundSettings.get();
    if (settings.muted) return;

    const entry = CATALOG[name];
    const now = Date.now();

    const last = this.lastPlayedAt.get(name) ?? 0;
    if (now - last < entry.minRetriggerMs) return;

    if (
      now < this.priorityLockUntil &&
      entry.priority < this.priorityLockLevel
    ) {
      return;
    }

    this.lastPlayedAt.set(name, now);
    this.priorityLockUntil = now + PRIORITY_LOCK_MS;
    this.priorityLockLevel = entry.priority;

    const variant =
      entry.samples[Math.floor(Math.random() * entry.samples.length)] ??
      entry.samples[0];
    this.manager.playSample(variant, entry.build, entry.durationMs);
  }
}
