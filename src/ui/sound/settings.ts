import {
  parseSoundSettings,
  type SoundSettings,
} from "../../boundary/soundSettings";

export type { SoundSettings } from "../../boundary/soundSettings";

const STORAGE_KEY = "bb-sound-settings";

const DEFAULT_SETTINGS: SoundSettings = { muted: false, volume: 0.7 };

function readSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return parseSoundSettings(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: SoundSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    return;
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
    this.listeners.forEach((listener) => {
      listener(this.settings);
    });
  }

  setVolume(volume: number): void {
    this.settings = {
      ...this.settings,
      volume: Math.min(1, Math.max(0, volume)),
    };
    writeSettings(this.settings);
    this.listeners.forEach((listener) => {
      listener(this.settings);
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const soundSettings = new SoundSettingsStore();
