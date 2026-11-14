import { soundSettings } from "../sound/settings";

// The clack of a die landing: recorded knocks, louder for a harder hit.

const CLACK_URLS = [1, 2, 3].map((n) => `/assets/sounds/dice-clack-${n}.mp3`);

let audio: AudioContext | null = null;
let clacks: Promise<AudioBuffer[]> | null = null;

/** Recorded single-die knocks, fetched and decoded once. Empty if audio is unavailable: the dice still roll. */
export function loadClacks(): Promise<AudioBuffer[]> {
  clacks ??= (async () => {
    audio ??= new AudioContext();
    const ctx = audio;
    return Promise.all(
      CLACK_URLS.map(async (url) =>
        ctx.decodeAudioData(await (await fetch(url)).arrayBuffer())
      )
    );
  })().catch(() => []);
  return clacks;
}

export function clack(strength: number) {
  void loadClacks().then((buffers) => {
    if (!audio || buffers.length === 0) return;
    const src = audio.createBufferSource();
    src.buffer = buffers[Math.floor(Math.random() * buffers.length)];
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const gain = audio.createGain();
    gain.gain.value = 0.6 * strength * soundSettings.get().volume;
    src.connect(gain).connect(audio.destination);
    src.start();
  });
}
