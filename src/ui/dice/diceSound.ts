import { loadAudio } from "../../boundary/audio";
import { soundSettings } from "../sound/settings";

const CLACK_URLS = [1, 2, 3].map(
  (n) => `/assets/sounds/dice-clack-${String(n)}.mp3`
);

let audio: AudioContext | null = null;
let clacks: Promise<AudioBuffer[]> | null = null;

export function loadClacks(): Promise<AudioBuffer[]> {
  clacks ??= (async () => {
    audio ??= new AudioContext();
    const ctx = audio;
    return Promise.all(CLACK_URLS.map((url) => loadAudio(ctx, url)));
  })().catch(() => []);
  return clacks;
}

export function clack(strength: number) {
  void loadClacks().then((buffers) => {
    if (!audio || buffers.length === 0) return;
    const src = audio.createBufferSource();
    const buffer = buffers[Math.floor(Math.random() * buffers.length)];
    if (!buffer) return;
    src.buffer = buffer;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const gain = audio.createGain();
    gain.gain.value = 0.6 * strength * soundSettings.get().volume;
    src.connect(gain).connect(audio.destination);
    src.start();
  });
}
