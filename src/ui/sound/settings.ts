const STORAGE_KEY = "bb-sound-settings";

export interface SoundSettings {
  muted: boolean;
  volume: number; // 0..1
}

const DEFAULT_SETTINGS: SoundSettings = { muted: false, volume: 0.7 };

function readSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      muted:
        typeof parsed.muted === "boolean"
          ? parsed.muted
          : DEFAULT_SETTINGS.muted,
      volume:
        typeof parsed.volume === "number"
          ? Math.min(1, Math.max(0, parsed.volume))
          : DEFAULT_SETTINGS.volume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: SoundSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private browsing, quota) — settings just won't persist.
  }
}

type Listener = (settings: SoundSettings) => void;

class SoundSettingsStore {
  private settings: SoundSettings = readSettings();
  private listeners = new Set<Listener>();

  get(): SoundSettings {
    return this.settings;
  }

  setMuted(muted: boolean): void {
    this.settings = { ...this.settings, muted };
    writeSettings(this.settings);
    this.listeners.forEach((listener) => listener(this.settings));
  }

  setVolume(volume: number): void {
    this.settings = { ...this.settings, volume: Math.min(1, Math.max(0, volume)) };
    writeSettings(this.settings);
    this.listeners.forEach((listener) => listener(this.settings));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Module-level singleton: one set of sound preferences shared by SoundSuite and any settings UI. */
export const soundSettings = new SoundSettingsStore();
