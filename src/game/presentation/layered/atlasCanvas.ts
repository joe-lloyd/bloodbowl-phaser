import type { AtlasPage } from "./lookAtlas";

export function pageCanvas(page: AtlasPage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  canvas.getContext("2d")?.putImageData(new ImageData(page.pixels, page.width, page.height), 0, 0);
  return canvas;
}
