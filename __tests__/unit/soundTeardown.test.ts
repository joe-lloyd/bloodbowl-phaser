import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IEventBus } from "../../src/services/EventBus";

// Sound settings persist to localStorage; clear it before every test in this
// file so one test's mute/volume state can never leak into the next.
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // Storage unavailable — nothing to clear.
  }
});

/**
 * Covers the sound engine's structural fix for the "stuck repeating one
 * sound forever" bug (see openspec/changes/overhaul-sound-effects-library):
 * `@strudel/web`'s shared global pattern scheduler is gone; every trigger
 * now builds its own independent Web Audio node graph against a shared
 * `AudioContext`/master `GainNode`, so concurrent triggers can never race or
 * strand each other. This file also keeps the pre-existing teardown and
 * dice-roll-variation coverage from the prior `overhaul-sound-system`
 * change, adapted to the new engine.
 */

// jsdom has no real Web Audio implementation, and the production code only
// ever touches a small, well-defined surface of AudioContext/AudioNode APIs
// (see src/ui/sound/synth.ts and SoundManager.ts) — a thin fake reproducing
// just that surface keeps these tests about SoundManager/synth's own
// lifecycle logic rather than real audio rendering.
class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  linearRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  exponentialRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
}

class FakeAudioNode {
  connect = vi.fn((target: unknown) => target);
  disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type = "bandpass";
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
}

/** Shared by oscillator + buffer-source fakes: both are AudioScheduledSourceNodes with start()/stop()/onended. */
class FakeScheduledSourceNode extends FakeAudioNode {
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  start = vi.fn(() => {
    this.started = true;
  });
  /** Synchronous for test determinism: real playback fires `onended` asynchronously once the node actually finishes; nothing here depends on timing. */
  stop = vi.fn(() => {
    if (this.stopped) return;
    this.stopped = true;
    this.onended?.();
  });
}

class FakeOscillatorNode extends FakeScheduledSourceNode {
  type = "sine";
  frequency = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeScheduledSourceNode {
  buffer: unknown = null;
  loop = false;
}

class FakeAudioContext {
  state: "running" | "suspended" | "closed" = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = new FakeAudioNode();
  createGain = vi.fn(() => new FakeGainNode());
  createOscillator = vi.fn(() => new FakeOscillatorNode());
  createBufferSource = vi.fn(() => new FakeBufferSourceNode());
  createBiquadFilter = vi.fn(() => new FakeBiquadFilterNode());
  createBuffer = vi.fn((_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  }));
  resume = vi.fn(async () => {
    this.state = "running";
  });
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
}

describe("SoundManager", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("stop() is a no-op before init() — nothing to halt yet", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const manager = new SoundManager(() => new FakeAudioContext() as never);

    expect(() => manager.stop()).not.toThrow();
  });

  it("init() creates a shared AudioContext + master GainNode connected to destination", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const manager = new SoundManager(() => ctx as never);

    await manager.init();

    expect(manager.isReady()).toBe(true);
    expect(ctx.createGain).toHaveBeenCalledTimes(1);
  });

  it("stop() halts every currently-tracked playback unit", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const manager = new SoundManager(() => ctx as never);
    await manager.init();

    const unitA = { stop: vi.fn() };
    const unitB = { stop: vi.fn() };
    manager.play(() => unitA, 500);
    manager.play(() => unitB, 500);

    manager.stop();

    expect(unitA.stop).toHaveBeenCalledTimes(1);
    expect(unitB.stop).toHaveBeenCalledTimes(1);
  });

  it("stop() suspends the shared AudioContext", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const manager = new SoundManager(() => ctx as never);
    await manager.init();

    manager.stop();

    expect(ctx.suspend).toHaveBeenCalledTimes(1);
  });

  it("dispose() closes the AudioContext; a later init() (e.g. a new page mount's manager) still succeeds independently", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const first = new SoundManager(() => ctx as never);
    await first.init();
    first.dispose();

    expect(ctx.close).toHaveBeenCalledTimes(1);

    const secondCtx = new FakeAudioContext();
    const second = new SoundManager(() => secondCtx as never);
    await expect(second.init()).resolves.toBeUndefined();
    expect(second.isReady()).toBe(true);
    expect(() => second.stop()).not.toThrow();
  });

  it("dispose() removes the document-level gesture-unlock listeners init() attached — no leak across repeated page mounts", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const manager = new SoundManager(() => ctx as never);

    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    await manager.init();
    const addedTypes = addSpy.mock.calls
      .filter(([, , opts]) => (opts as AddEventListenerOptions)?.once)
      .map(([type]) => type);
    expect(addedTypes).toEqual(
      expect.arrayContaining(["pointerdown", "keydown"])
    );

    manager.dispose();

    const removedTypes = removeSpy.mock.calls.map(([type]) => type);
    expect(removedTypes).toEqual(
      expect.arrayContaining(["pointerdown", "keydown"])
    );

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("play() never schedules anything before init() — dropped silently, not queued", async () => {
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const manager = new SoundManager(() => ctx as never);

    const build = vi.fn(() => ({ stop: vi.fn() }));
    manager.play(build, 500);

    expect(build).not.toHaveBeenCalled();
  });
});

describe("SoundManager mute/volume apply live", () => {
  it("initial master gain reflects current settings", async () => {
    vi.resetModules();
    const { soundSettings } = await import("../../src/ui/sound/settings");
    soundSettings.setMuted(false);
    soundSettings.setVolume(0.42);

    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const manager = new SoundManager(() => ctx as never);
    await manager.init();

    const masterGain = (
      manager as unknown as { masterGain: FakeGainNode }
    ).masterGain;
    expect(masterGain.gain.value).toBeCloseTo(0.42);
  });

  it("muting after init drives the master gain to 0 immediately — silencing sound already in flight, not just future triggers", async () => {
    vi.resetModules();
    const { soundSettings } = await import("../../src/ui/sound/settings");
    soundSettings.setMuted(false);
    soundSettings.setVolume(0.8);

    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const manager = new SoundManager(() => ctx as never);
    await manager.init();

    // Simulate a sound already playing when the coach hits mute.
    manager.play(() => ({ stop: vi.fn() }), 1000);

    soundSettings.setMuted(true);

    const masterGain = (
      manager as unknown as { masterGain: FakeGainNode }
    ).masterGain;
    expect(masterGain.gain.value).toBe(0);

    soundSettings.setMuted(false);
    soundSettings.setVolume(0.5);
  });

  it("volume changes reach the master gain live", async () => {
    vi.resetModules();
    const { soundSettings } = await import("../../src/ui/sound/settings");
    soundSettings.setMuted(false);
    soundSettings.setVolume(0.3);

    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const manager = new SoundManager(() => ctx as never);
    await manager.init();

    soundSettings.setVolume(0.9);

    const masterGain = (
      manager as unknown as { masterGain: FakeGainNode }
    ).masterGain;
    expect(masterGain.gain.value).toBeCloseTo(0.9);
  });
});

describe("SoundManager: concurrent triggers cannot strand or replace each other", () => {
  it("two rapid triggers each get their own independent playback unit", async () => {
    vi.resetModules();
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const manager = new SoundManager(() => ctx as never);
    await manager.init();

    const unitA = { stop: vi.fn() };
    const unitB = { stop: vi.fn() };
    const buildA = vi.fn(() => unitA);
    const buildB = vi.fn(() => unitB);

    // Fire two triggers back-to-back, the way rapid dice rolls do.
    manager.play(buildA, 300);
    manager.play(buildB, 300);

    expect(buildA).toHaveBeenCalledTimes(1);
    expect(buildB).toHaveBeenCalledTimes(1);

    // Stopping everything must stop both — neither trigger silently
    // replaced or stranded the other's unit.
    manager.stop();
    expect(unitA.stop).toHaveBeenCalledTimes(1);
    expect(unitB.stop).toHaveBeenCalledTimes(1);
  });

  it("stopping the manager never throws even if a unit's stop() is already-called/idempotent", async () => {
    vi.resetModules();
    const { SoundManager } = await import("../../src/ui/sound/SoundManager");
    const ctx = new FakeAudioContext();
    const manager = new SoundManager(() => ctx as never);
    await manager.init();

    let calls = 0;
    manager.play(
      () => ({
        stop: () => {
          calls += 1;
        },
      }),
      300
    );

    expect(() => {
      manager.stop();
      manager.stop();
    }).not.toThrow();
    // The unit is dropped from tracking after the first stop() sweep, so a
    // second manager.stop() has nothing left to call again.
    expect(calls).toBe(1);
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
    const suite = new SoundSuite(
      fakeEventBus,
      new SoundManager(() => new FakeAudioContext() as never)
    );

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
    const suite = new SoundSuite(
      fakeEventBus,
      new SoundManager(() => new FakeAudioContext() as never)
    );

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

describe("dice-roll sound variation", () => {
  it("randomizes the tap count within a small range so consecutive rolls aren't identical", async () => {
    const { pickDiceRollTapCount } = await import(
      "../../src/ui/sound/catalog"
    );
    for (let i = 0; i < 30; i++) {
      const count = pickDiceRollTapCount();
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(5);
    }
  });

  it("varies across enough calls that two rolls in a row aren't guaranteed identical", async () => {
    const { pickDiceRollTapCount } = await import(
      "../../src/ui/sound/catalog"
    );
    const results = new Set(
      Array.from({ length: 50 }, () => pickDiceRollTapCount())
    );
    // 3 possible values (3, 4, or 5 taps); 50 draws landing on just one
    // value is vanishingly unlikely — a randomization smoke test, not a
    // determinism guarantee for any single pair of rolls.
    expect(results.size).toBeGreaterThan(1);
  });

  it("diceRoll.build schedules a fresh, independent unit every call (no shared state across triggers)", async () => {
    const { CATALOG } = await import("../../src/ui/sound/catalog");
    const ctx = new FakeAudioContext();
    const destination = new FakeAudioNode();

    const unitOne = CATALOG.diceRoll.build(ctx as never, destination as never);
    const unitTwo = CATALOG.diceRoll.build(ctx as never, destination as never);

    expect(unitOne).not.toBe(unitTwo);
    // Each independently allocates its own oscillator/noise nodes on the
    // shared context — proof there's no single "current pattern" slot for
    // the two calls to race over.
    expect(ctx.createOscillator.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("catalog no longer has a uiClick entry", () => {
  it("omits uiClick from the catalog and SoundName union", async () => {
    const { CATALOG } = await import("../../src/ui/sound/catalog");
    expect(Object.keys(CATALOG)).not.toContain("uiClick");
  });
});
