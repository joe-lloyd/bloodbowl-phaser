import type { ScreenRect } from "../controllers/CameraController";

let locate: (() => ScreenRect[]) | null = null;

export function provideActionRects(locator: () => ScreenRect[]): () => void {
  locate = locator;
  return () => {
    if (locate === locator) locate = null;
  };
}

export function actionRects(): ScreenRect[] {
  return locate?.() ?? [];
}
