import { type PlaybackUnit, sample } from "./synth";
import { SAMPLE_URLS } from "./catalog";
import { soundSettings, type SoundSettings } from "./settings";
import { loadAudio } from "../../boundary/audio";

type AudioContextFactory = () => AudioContext;
type Build = (ctx: AudioContext, dest: AudioNode) => PlaybackUnit;

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private activeUnits = new Set<PlaybackUnit>();

  private samples = new Map<string, Promise<AudioBuffer | null>>();

  private generation = 0;
  private unsubscribeSettings: (() => void) | null = null;
  private gestureListenerAttached = false;
  private gestureResumeHandler: (() => void) | null = null;
  private readonly createContext: AudioContextFactory;

  constructor(createContext?: AudioContextFactory) {
    this.createContext = createContext ?? defaultCreateContext;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
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

      const ctx = this.ctx;
      for (const url of SAMPLE_URLS) this.samples.set(url, loadSample(ctx, url));

      this.isInitialized = true;
      resolve();
    });

    return this.initPromise;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  public play(build: Build, durationMs: number): void {
    if (!this.isInitialized || !this.ctx || !this.masterGain) return;
    try {
      if (this.ctx.state === "suspended") {
        void this.ctx.resume().catch(() => undefined);
      }
      const unit = build(this.ctx, this.masterGain);
      this.activeUnits.add(unit);
      setTimeout(
        () => this.activeUnits.delete(unit),
        Math.max(durationMs, 0) + 250
      );
    } catch (error) {
      console.error("SoundManager: Error playing sound", error);
    }
  }

  public playSample(url: string, fallback: Build, fallbackMs: number): void {
    if (!this.isInitialized || !this.ctx) return;
    const loading = this.samples.get(url) ?? loadSample(this.ctx, url);
    this.samples.set(url, loading);
    const generation = this.generation;
    void loading.then((buffer) => {
      if (generation !== this.generation) return;
      if (!buffer) {
        this.play(fallback, fallbackMs);
        return;
      }
      this.play(
        (ctx, dest) => sample(ctx, dest, buffer),
        buffer.duration * 1000
      );
    });
  }

  public stop(): void {
    this.generation += 1;
    this.activeUnits.forEach((unit) => {
      try {
        unit.stop();
      } catch (error) {
        console.error("SoundManager: Error stopping unit", error);
      }
    });
    this.activeUnits.clear();

    if (this.ctx?.state === "running") {
      this.ctx.suspend().catch((error: unknown) => {
        console.error("SoundManager: Error suspending AudioContext", error);
      });
    }
  }

  public dispose(): void {
    this.stop();
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    this.detachGestureUnlock();
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch((error: unknown) => {
        console.error("SoundManager: Error closing AudioContext", error);
      });
    }
    this.ctx = null;
    this.masterGain = null;
    this.samples.clear();
    this.isInitialized = false;
    this.initPromise = null;
  }

  private attachGestureUnlock(): void {
    if (this.gestureListenerAttached || typeof document === "undefined") {
      return;
    }
    this.gestureListenerAttached = true;
    const resume = () => {
      this.ctx?.resume().catch((error: unknown) => {
        console.error("SoundManager: Error resuming AudioContext", error);
      });
    };
    this.gestureResumeHandler = resume;
    document.addEventListener("pointerdown", resume, { once: true });
    document.addEventListener("keydown", resume, { once: true });
  }

  private detachGestureUnlock(): void {
    if (!this.gestureListenerAttached || typeof document === "undefined") {
      return;
    }
    if (this.gestureResumeHandler) {
      document.removeEventListener("pointerdown", this.gestureResumeHandler);
      document.removeEventListener("keydown", this.gestureResumeHandler);
    }
    this.gestureListenerAttached = false;
    this.gestureResumeHandler = null;
  }
}

async function loadSample(
  ctx: AudioContext,
  url: string
): Promise<AudioBuffer | null> {
  try {
    return await loadAudio(ctx, url);
  } catch (error) {
    console.warn(`SoundManager: could not load ${url}, using synth`, error);
    return null;
  }
}

function gainForSettings(settings: SoundSettings): number {
  return settings.muted ? 0 : settings.volume;
}

function defaultCreateContext(): AudioContext {
  const browser: {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  } = window;
  const Ctor = browser.AudioContext ?? browser.webkitAudioContext;
  if (!Ctor) {
    throw new Error("Web Audio API is not available in this browser");
  }
  return new Ctor();
}
