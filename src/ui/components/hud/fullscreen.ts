export async function goFullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch {
    return;
  }
}
