import { loadAudio } from "../../boundary/audio";
import { outputGain, soundSettings } from "../sound/settings";

const CLACK_URLS = [1, 2, 3].map(
  (n) => `/assets/sounds/dice-clack-${String(n)}.mp3`
);

const clackState: {
  audio: AudioContext | null;
  clacks: Promise<AudioBuffer[]> | null;
} = { audio: null, clacks: null };

export function loadClacks(): Promise<AudioBuffer[]> {
  clackState.clacks ??= (async () => {
    clackState.audio ??= new AudioContext();
    const ctx = clackState.audio;
    return Promise.all(CLACK_URLS.map((url) => loadAudio(ctx, url)));
  })().catch(() => []);
  return clackState.clacks;
}

export function clack(strength: number) {
  void loadClacks().then((buffers) => {
    if (!clackState.audio || buffers.length === 0) return;
    const src = clackState.audio.createBufferSource();
    const buffer = buffers[Math.floor(Math.random() * buffers.length)];
    if (!buffer) return;
    src.buffer = buffer;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const gain = clackState.audio.createGain();
    gain.gain.value = 0.6 * strength * outputGain(soundSettings.get());
    src.connect(gain).connect(clackState.audio.destination);
    src.start();
  });
}
