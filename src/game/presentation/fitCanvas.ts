import type Phaser from "phaser";

type Scale = Pick<
  Phaser.Scale.ScaleManager,
  "width" | "height" | "getParentBounds" | "refresh"
>;

export function keepCanvasFitted(
  scale: () => Scale | null,
  container: HTMLElement
): () => void {
  if (typeof ResizeObserver === "undefined") return () => undefined;
  const observer = new ResizeObserver(() => {
    const manager = scale();
    if (!manager) return;
    const { width, height } = container.getBoundingClientRect();
    if (manager.width === width && manager.height === height) return;
    manager.getParentBounds();
    manager.refresh();
  });
  observer.observe(container);
  return () => {
    observer.disconnect();
  };
}
