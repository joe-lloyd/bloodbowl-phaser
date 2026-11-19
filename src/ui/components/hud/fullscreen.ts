export async function goFullscreenLandscape(): Promise<void> {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen({
        navigationUI: "hide",
      });
    const orientation: {
      lock?: (orientation: "landscape") => Promise<void>;
    } = screen.orientation;
    await orientation.lock?.("landscape");
  } catch {
    return;
  }
}
