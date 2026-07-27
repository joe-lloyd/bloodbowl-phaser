import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IEventBus } from "../../src/services/EventBus";

/**
 * Covers the "leaving a match fully stops all sound" requirement added by
 * openspec/changes/overhaul-sound-system: SoundManager.stop() must halt the
 * shared @strudel/web scheduler, and SoundSuite.dispose() must stop every
 * in-flight one-shot sample it fired via playSample() — not just unsubscribe
 * its event bindings. See tasks.md 5.1/5.2.
 */

// `@strudel/web` wraps a real Web Audio scheduler that doesn't exist in
// jsdom; the production code already treats it as an opaque dependency
// (SoundManager only calls a handful of top-level functions on it), so a
// thin mock keeps these tests about SoundManager's own stop()/init() logic
// rather than the audio engine itself.
const hushMock = vi.fn();
const initStrudelMock = vi.fn();
const initAudioOnFirstClickMock = vi.fn().mockResolvedValue(undefined);
const getAudioContextMock = vi.fn(() => ({
  state: "running",
  resume: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@strudel/web", () => ({
  note: vi.fn(),
  s: vi.fn(),
  stack: vi.fn(),
  initStrudel: initStrudelMock,
  initAudioOnFirstClick: initAudioOnFirstClickMock,
  getAudioContext: getAudioContextMock,
  hush: hushMock,
}));

// Deterministic stand-in for the browser's Audio element: exposes just
// enough (play/pause/addEventListener/an `_emit` test helper) to prove
// SoundSuite tracks and releases instances correctly.
class FakeAudio {
  paused = true;
  currentTime = 0;
  volume = 1;
  src: string;
  private listeners = new Map<string, Array<() => void>>();

  constructor(src: string) {
    this.src = src;
  }

  addEventListener(event: string, handler: () => void): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  _emit(event: string): void {
    this.listeners.get(event)?.forEach((handler) => handler());
  }
}

describe("SoundManager.stop", () => {
  beforeEach(() => {
    hushMock.mockClear();
    initStrudelMock.mockClear();
    initAudioOnFirstClickMock.mockClear();
  });

  it("is a no-op before init() — nothing to halt yet", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const manager = new SoundManager();

    expect(() => manager.stop()).not.toThrow();
    expect(hushMock).not.toHaveBeenCalled();
  });

  it("halts the shared @strudel/web scheduler once initialized", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const manager = new SoundManager();

    await manager.init();
    manager.stop();

    expect(hushMock).toHaveBeenCalledTimes(1);
  });

  it("also stops whatever cycle is currently playing (e.g. the opening theme)", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const manager = new SoundManager();
    await manager.init();

    const fakeCycle = { stop: vi.fn() };
    // Exercises stop()'s own currentCycle-handling contract directly,
    // independent of whichever synth pattern produced the cycle.
    (manager as unknown as { currentCycle: unknown }).currentCycle = fakeCycle;

    manager.stop();

    expect(fakeCycle.stop).toHaveBeenCalledTimes(1);
    expect(hushMock).toHaveBeenCalledTimes(1);
    expect(
      (manager as unknown as { currentCycle: unknown }).currentCycle
    ).toBeNull();
  });

  it("a later init() after stop() re-initializes cleanly (no stale/dead scheduler)", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const first = new SoundManager();
    await first.init();
    first.stop();

    // A new page mount creates a fresh SoundManager (see GamePage.tsx) —
    // its init() must still succeed and be independently usable.
    const second = new SoundManager();
    await expect(second.init()).resolves.toBeUndefined();
    expect(second.isReady()).toBe(true);
    expect(() => second.stop()).not.toThrow();
  });
});

describe("SoundSuite.dispose", () => {
  const fakeEventBus: IEventBus = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  let originalAudio: typeof Audio;

  beforeEach(() => {
    originalAudio = globalThis.Audio;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Audio = FakeAudio;
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
    vi.doUnmock("../../src/ui/sound/catalog");
    vi.resetModules();
  });

  it("stops and releases every in-flight sample it fired, not just its event bindings", async () => {
    vi.doMock("../../src/ui/sound/catalog", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("../../src/ui/sound/catalog")>();
      return {
        ...actual,
        CATALOG: {
          ...actual.CATALOG,
          diceRoll: {
            ...actual.CATALOG.diceRoll,
            sampleUrl: "fake://dice-roll.mp3",
          },
        },
      };
    });

    const { SoundSuite } = await import("../../src/ui/sound/SoundSuite");
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const suite = new SoundSuite(fakeEventBus, new SoundManager());

    suite.play("diceRoll");

    const activeSamples = (
      suite as unknown as { activeSamples: Set<FakeAudio> }
    ).activeSamples;
    expect(activeSamples.size).toBe(1);
    const [audio] = [...activeSamples];
    expect(audio.paused).toBe(false);

    suite.dispose();

    expect(audio.paused).toBe(true);
    expect(activeSamples.size).toBe(0);
  }, 15000);

  it("removes a sample from tracking once it finishes on its own (ended)", async () => {
    vi.doMock("../../src/ui/sound/catalog", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("../../src/ui/sound/catalog")>();
      return {
        ...actual,
        CATALOG: {
          ...actual.CATALOG,
          diceRoll: {
            ...actual.CATALOG.diceRoll,
            sampleUrl: "fake://dice-roll.mp3",
          },
        },
      };
    });

    const { SoundSuite } = await import("../../src/ui/sound/SoundSuite");
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const suite = new SoundSuite(fakeEventBus, new SoundManager());

    suite.play("diceRoll");
    const activeSamples = (
      suite as unknown as { activeSamples: Set<FakeAudio> }
    ).activeSamples;
    expect(activeSamples.size).toBe(1);
    const [audio] = [...activeSamples];

    audio._emit("ended");

    expect(activeSamples.size).toBe(0);
  }, 15000);
});

describe("dice-roll sound variation", () => {
  it("offers more than one pattern so consecutive rolls aren't identical", async () => {
    const { DICE_ROLL_PATTERNS } = await import("../../src/ui/sound/catalog");
    expect(DICE_ROLL_PATTERNS.length).toBeGreaterThan(1);
    expect(new Set(DICE_ROLL_PATTERNS).size).toBe(DICE_ROLL_PATTERNS.length);
  });

  it("picks a pattern from that set", async () => {
    const { DICE_ROLL_PATTERNS, pickDiceRollPattern } = await import(
      "../../src/ui/sound/catalog"
    );
    for (let i = 0; i < 20; i++) {
      expect(DICE_ROLL_PATTERNS).toContain(pickDiceRollPattern());
    }
  });

  it("varies across enough calls that two rolls in a row aren't guaranteed identical", async () => {
    const { pickDiceRollPattern } = await import("../../src/ui/sound/catalog");
    const results = new Set(
      Array.from({ length: 50 }, () => pickDiceRollPattern())
    );
    // With 5 equally-likely variants, 50 draws landing on just one value is
    // vanishingly unlikely — this is a randomization smoke test, not a
    // determinism guarantee for any single pair of rolls.
    expect(results.size).toBeGreaterThan(1);
  });
});
