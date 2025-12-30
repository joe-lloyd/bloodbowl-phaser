import { note, s, stack } from "@strudel/web";
import {
  initAudioOnFirstClick,
  getAudioContext,
  initStrudel,
} from "@strudel/web";

export class SoundManager {
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private currentCycle = null;

  constructor() {
    console.log("SoundManager created.");
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    console.log("SoundManager: Initializing...");

    this.initPromise = (async () => {
      // Initialize Strudel Runtime (scheduler, repl context)
      initStrudel({
        preload: true,
      });

      // Strudel needs a user interaction to start the AudioContext
      await initAudioOnFirstClick();

      this.isInitialized = true;
      console.log("SoundManager: Init complete.");
    })();

    return this.initPromise;
  }

  public async playOpeningTheme(): Promise<void> {
    console.log("SoundManager: playOpeningTheme called");

    // Wait for initialization if needed
    if (!this.isInitialized) {
      console.log("SoundManager: waiting for init...");
      if (!this.initPromise) await this.init();
      else await this.initPromise;
    }

    this.stop();

    const ctx = getAudioContext();
    if (ctx?.state === "suspended") {
      console.warn(
        "SoundManager: AudioContext is suspended! Waiting for resume..."
      );
      try {
        await ctx.resume();
        console.log("SoundManager: AudioContext Resumed");
      } catch (e) {
        console.warn("SoundManager: Resume failed", e);
      }
    }

    // Justice / Gesaffelstein Style (All-Sine Version)
    // Using only Sine waves to ensure zero console errors (bypassing PeriodicWave issues)
    // We rely on Gain/Overdrive to create texture if possible, or just keep it clean/deep.

    // 1. Heavy Kick
    const kick = s("sine").n("c1").decay(0.1).gain(2.0);

    // 2. Deep Bass (E1 G1)
    // Sine wave at high gain can clip in the master sometimes, or just sounds deep.
    const bass = note("E1 E1 E1 G1").s("sine").decay(0.2).gain(1.5);

    // 3. Snare/Clap (Simulated)
    // Mid-pitch sine drop
    const snare = s("~ sine").n("c3").decay(0.05).gain(0.8);

    // 4. High Hat
    // High pitch blip
    const hihat = s("sine*8").n("c6").decay(0.02).gain(0.3);

    // Layer them
    const track = stack(kick, bass, snare, hihat).fast(1.9); // ~114 BPM

    console.log("SoundManager: Scheduling playback...");

    this.currentCycle = track.play();
    console.log("SoundManager: Playback scheduled. Cycle:", this.currentCycle);
  }

  public playGameplayTheme(): void {
    this.stop();
    // Placeholder for ambient
  }

  public playSFX(_type: "dice" | "kick" | "whistle"): void {
    // Placeholder for SFX
  }

  public stop(): void {
    if (this.currentCycle) {
      console.log("SoundManager: Stopping cycle", this.currentCycle);
      try {
        if (typeof this.currentCycle.stop === "function") {
          this.currentCycle.stop();
        } else if (typeof this.currentCycle.pause === "function") {
          this.currentCycle.pause();
        } else {
          console.warn(
            "SoundManager: Cycle object has no stop/pause method!",
            this.currentCycle
          );
        }
      } catch (e) {
        console.error("SoundManager: Error stopping cycle", e);
      }
      this.currentCycle = null;
    }
  }
}
