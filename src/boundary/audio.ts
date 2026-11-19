export async function loadAudio(
  context: AudioContext,
  url: string
): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return context.decodeAudioData(await response.arrayBuffer());
}
