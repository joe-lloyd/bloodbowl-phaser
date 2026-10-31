import Phaser from "phaser";

/**
 * Skip Phaser's render on steps where nothing on screen changed.
 *
 * Phaser redraws the whole canvas every step, 60 times a second, even when
 * the board is still. After each update this reads what the frame would
 * draw: every visible object's transform, frame, tint, text and shape, and
 * every camera. When that matches the last frame drawn, the clear and the
 * draw are skipped and the canvas keeps showing the last frame. Updates,
 * input, tweens and timers still run every step.
 *
 * Install with the game config's `callbacks.postBoot`, which runs just
 * before the loop starts.
 */
export function renderOnlyOnChange(game: Phaser.Game): void {
  const { renderer, scene: scenes } = game;
  // Two buffers, swapped, so a step allocates nothing
  let drawn: unknown[] = [];
  let next: unknown[] = [];
  let skip = false;

  game.events.on(Phaser.Core.Events.POST_STEP, () => {
    next.length = 0;
    frameState(game, next);
    skip = sameValues(next, drawn);
    if (!skip) [drawn, next] = [next, drawn];
  });

  const preRender = renderer.preRender.bind(renderer);
  const postRender = renderer.postRender.bind(renderer);
  const render = scenes.render.bind(scenes);
  renderer.preRender = () => {
    if (!skip) preRender();
  };
  renderer.postRender = () => {
    if (!skip) postRender();
  };
  scenes.render = (target) => {
    if (!skip) render(target);
  };
}

function sameValues(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Everything a render reads, flattened to primitives in draw order. */
function frameState(game: Phaser.Game, out: unknown[]): void {
  out.push(game.scale.width, game.scale.height);
  for (const scene of game.scene.getScenes(true)) {
    out.push(scene.sys.settings.key, scene.sys.settings.visible);
    for (const camera of scene.cameras.cameras) {
      out.push(
        camera.visible,
        camera.x,
        camera.y,
        camera.width,
        camera.height,
        camera.scrollX,
        camera.scrollY,
        camera.zoomX,
        camera.zoomY,
        camera.alpha,
        camera.backgroundColor.color32,
        camera.fadeEffect.isRunning,
        camera.fadeEffect.isComplete,
        camera.fadeEffect.progress,
        camera.flashEffect.isRunning,
        camera.flashEffect.progress,
        camera.shakeEffect.isRunning,
        // A shake moves the camera every frame it runs
        camera.shakeEffect.progress
      );
    }
    for (const object of scene.children.list) pushObject(object, out);
  }
}

function pushObject(object: Phaser.GameObjects.GameObject, out: unknown[]) {
  // Identity first: an object swapped for another always redraws
  out.push(object);
  if (object instanceof Phaser.GameObjects.Container) {
    pushTransform(object, out);
    out.push(object.visible, object.alpha, object.depth, object.list.length);
    for (const child of object.list) pushObject(child, out);
    return;
  }
  if (
    object instanceof Phaser.GameObjects.Image ||
    object instanceof Phaser.GameObjects.Sprite ||
    object instanceof Phaser.GameObjects.Text
  ) {
    pushTransform(object, out);
    out.push(
      object.visible,
      object.alpha,
      object.depth,
      object.blendMode,
      object.originX,
      object.originY,
      object.flipX,
      object.flipY,
      object.texture.key,
      object.frame.name,
      object.frame.cutWidth,
      object.frame.cutHeight,
      object.tintTopLeft,
      object.tintTopRight,
      object.tintBottomLeft,
      object.tintBottomRight,
      object.tintFill,
      object.mask
    );
    if (object instanceof Phaser.GameObjects.Text)
      out.push(object.text, object.style.color, object.style.stroke);
    return;
  }
  if (object instanceof Phaser.GameObjects.Graphics) {
    pushTransform(object, out);
    out.push(object.visible, object.alpha, object.depth, object.mask);
    for (const command of object.commandBuffer) out.push(command);
    return;
  }
  if (object instanceof Phaser.GameObjects.Shape) {
    pushTransform(object, out);
    out.push(
      object.visible,
      object.alpha,
      object.depth,
      object.originX,
      object.originY,
      object.width,
      object.height,
      object.isFilled,
      object.fillColor,
      object.fillAlpha,
      object.isStroked,
      object.strokeColor,
      object.strokeAlpha,
      object.lineWidth,
      object.mask,
      // Phaser builds a new path array whenever a shape's geometry changes
      object.pathData
    );
    return;
  }
  // A kind not read here: draw every frame, as Phaser would
  out.push(NaN);
}

function pushTransform(
  object: Phaser.GameObjects.Components.Transform &
    Phaser.GameObjects.Components.ScrollFactor,
  out: unknown[]
) {
  out.push(
    object.x,
    object.y,
    object.scaleX,
    object.scaleY,
    object.rotation,
    object.scrollFactorX,
    object.scrollFactorY
  );
}
