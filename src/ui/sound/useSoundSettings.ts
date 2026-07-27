import { useEffect, useState } from "react";
import { soundSettings, SoundSettings } from "./settings";

export function useSoundSettings(): SoundSettings & {
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
} {
  const [settings, setSettings] = useState(soundSettings.get());

  useEffect(() => soundSettings.subscribe(setSettings), []);

  return {
    ...settings,
    setMuted: (muted: boolean) => soundSettings.setMuted(muted),
    setVolume: (volume: number) => soundSettings.setVolume(volume),
  };
}
