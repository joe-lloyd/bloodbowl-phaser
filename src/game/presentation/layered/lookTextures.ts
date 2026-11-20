import Phaser from "phaser";
import type { LookAtlas } from "./lookAtlas";
import {
  loadLookAtlas,
  lookTextureKey,
  type LookRequest,
  type PlayerLookRequest,
} from "./layeredModels";

function addAtlasTexture(
  textures: Phaser.Textures.TextureManager,
  key: string,
  atlas: LookAtlas
): void {
  const canvas = document.createElement("canvas");
  canvas.width = atlas.width;
  canvas.height = atlas.height;
  canvas
    .getContext("2d")
    ?.putImageData(
      new ImageData(atlas.pixels, atlas.width, atlas.height),
      0,
      0
    );
  const texture = textures.addCanvas(key, canvas);
  if (!texture) return;
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  for (const [name, rect] of Object.entries(atlas.frames)) {
    texture
      .add(name, 0, rect.x, rect.y, rect.w, rect.h)
      ?.setTrim(atlas.size, atlas.size, rect.sx, rect.sy, rect.w, rect.h);
  }
}

function lookFileClass() {
  return class LookFile extends Phaser.Loader.File {
    private readonly request: LookRequest;
    private atlas: LookAtlas | null = null;

    constructor(
      loader: Phaser.Loader.LoaderPlugin,
      key: string,
      request: LookRequest
    ) {
      super(loader, { type: "playerLook", key, url: `look:${key}` });
      this.request = request;
    }

    override load(): void {
      this.state = Phaser.Loader.FILE_LOADING;
      loadLookAtlas(this.request)
        .then((atlas) => {
          this.atlas = atlas;
          this.loader.nextFile(this, true);
        })
        .catch(() => {
          this.loader.nextFile(this, false);
        });
    }

    override onProcess(): void {
      this.state = Phaser.Loader.FILE_PROCESSING;
      if (this.atlas && !this.loader.textureManager.exists(this.key)) {
        addAtlasTexture(this.loader.textureManager, this.key, this.atlas);
      }
      this.onProcessComplete();
    }
  };
}

let LookFileClass: ReturnType<typeof lookFileClass> | null = null;

function lookFile(
  loader: Phaser.Loader.LoaderPlugin,
  key: string,
  request: LookRequest
): Phaser.Loader.File {
  LookFileClass ??= lookFileClass();
  return new LookFileClass(loader, key, request);
}

export function preloadLooks(
  scene: Phaser.Scene,
  requests: readonly PlayerLookRequest[]
): void {
  const queued = new Set<string>();
  for (const request of requests) {
    const key = lookTextureKey(request);
    if (key === null || queued.has(key) || scene.textures.exists(key)) continue;
    queued.add(key);
    scene.load.addFile(lookFile(scene.load, key, request));
  }
}
