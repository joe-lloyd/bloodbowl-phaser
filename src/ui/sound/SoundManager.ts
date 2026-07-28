import { PlaybackUnit } from "./synth";
import { soundSettings, SoundSettings } from "./settings";

type AudioContextFactory = () => AudioContext;

/**
 * Owns the shared `AudioContext` and a single master `GainNode` that every
 * catalog effect's node graph connects to (directly or transitively). This
 * replaces `@strudel/web`'s global pattern scheduler: there is no "current
 * pattern" slot for two triggers to race over — every `play()` call builds
 * and schedules its own independent nodes on the browser's own
 * sample-accurate audio clock, so a rapid sequence of triggers can never
 * silently replace/strand each other (the bug this replaces; see
 * design.md).
 *
 * Mute/volume are wired straight into the master gain, so a settings change
 * reaches sound already in flight, not just future triggers.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private activeUnits = new Set<PlaybackUnit>();
  private unsubscribeSettings: (() => void) | null = null;
  private gestureListenerAttached = false;
  private readonly createContext: AudioContextFactory;

  constructor(createContext?: AudioContextFactory) {
    this.createContext = createContext ?? defaultCreateContext;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.ctx = this.createContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = gainForSettings(soundSettings.get());
      this.masterGain.connect(this.ctx.destination);

      this.unsubscribeSettings = soundSettings.subscribe((settings) => {
        if (this.masterGain) {
          this.masterGain.gain.value = gainForSettings(settings);
        }
      });

      this.attachGestureUnlock();

      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Build and immediately schedule a fresh, independent one-shot playback
   * unit against the shared context/master gain. `durationMs` is used only
   * to eventually drop the unit's bookkeeping reference from `activeUnits`
   * — it never forces playback to stop early, so a late/early timer here
   * cannot cut off or strand audio (unlike the old Strudel-based
   * `playOneShot`, whose `setTimeout` *was* the only thing stopping
   * playback).
   */
  public play(
    build: (ctx: AudioContext, dest: AudioNode) => PlaybackUnit,
    durationMs: number
  ): void {
    if (!this.isInitialized || !this.ctx || !this.masterGain) return;
    try {
      // stop() suspends the context as a failsafe; a later play() (e.g. the
      // debug page's "Stop All" followed by another "Play") must revive it,
      // since the one-time gesture-unlock listener has typically already
      // fired and removed itself by then.
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {
          // Best-effort — if this fails, the browser is still waiting on a
          // user gesture, and the next real click/keydown resolves it.
        });
      }
      const unit = build(this.ctx, this.masterGain);
      this.activeUnits.add(unit);
      setTimeout(
        () => this.activeUnits.delete(unit),
        Math.max(durationMs, 0) + 250
      );
    } catch (e) {
      console.error("SoundManager: Error playing sound", e);
    }
  }

  /**
   * Halts every currently-tracked playback unit immediately (each unit's
   * own `stop()` is idempotent, so this is safe to call even if some units
   * already finished naturally) and suspends the shared `AudioContext`.
   * Safe to call whether or not anything is currently playing, and whether
   * or not `init()` has run.
   */
  public stop(): void {
    this.activeUnits.forEach((unit) => {
      try {
        unit.stop();
      } catch (e) {
        console.error("SoundManager: Error stopping unit", e);
      }
    });
    this.activeUnits.clear();

    if (this.ctx && this.ctx.state === "running") {
      this.ctx.suspend().catch((e) => {
        console.error("SoundManager: Error suspending AudioContext", e);
      });
    }
  }

  /**
   * Fully tears down this manager's `AudioContext` — called from page
   * unmount alongside `stop()`. A new page mount always creates a fresh
   * `SoundManager` (see GamePage.tsx), so nothing needs this instance to
   * remain reusable afterward; closing (rather than merely suspending)
   * avoids leaking `AudioContext`s across repeated match sessions.
   */
  public dispose(): void {
    this.stop();
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch((e) => {
        console.error("SoundManager: Error closing AudioContext", e);
      });
    }
    this.ctx = null;
    this.masterGain = null;
    this.isInitialized = false;
    this.initPromise = null;
  }

  /** Browsers require a user gesture before an AudioContext can produce audible sound; resume it on the first one rather than blocking init() on it. */
  private attachGestureUnlock(): void {
    if (this.gestureListenerAttached || typeof document === "undefined") {
      return;
    }
    this.gestureListenerAttached = true;
    const resume = () => {
      this.ctx?.resume().catch((e) => {
        console.error("SoundManager: Error resuming AudioContext", e);
      });
    };
    document.addEventListener("pointerdown", resume, { once: true });
    document.addEventListener("keydown", resume, { once: true });
  }
}

function gainForSettings(settings: SoundSettings): number {
  return settings.muted ? 0 : settings.volume;
}

function defaultCreateContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) {
    throw new Error("Web Audio API is not available in this browser");
  }
  return new Ctor();
}
