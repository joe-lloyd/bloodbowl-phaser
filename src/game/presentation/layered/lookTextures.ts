import Phaser from "phaser";
import { pageCanvas } from "./atlasCanvas";
import type { LookAtlas } from "./lookAtlas";
import {
  loadLookAtlas,
  lookTextureKey,
  releaseLookAtlas,
  type LookRequest,
  type PlayerLookRequest,
} from "./layeredModels";

function addAtlasTexture(
  textures: Phaser.Textures.TextureManager,
  key: string,
  atlas: LookAtlas
): void {
  const texture = textures.create(key, atlas.pages.map((element) => pageCanvas(element)));
  if (!texture) return;
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  for (const [name, rect] of Object.entries(atlas.frames)) {
    texture
      .add(name, rect.page, rect.x, rect.y, rect.w, rect.h)
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
        .catch((error: unknown) => {
          console.warn(`Could not build the player look ${this.key}`, error);
          this.loader.nextFile(this, false);
        });
    }

    override onProcess(): void {
      this.state = Phaser.Loader.FILE_PROCESSING;
      if (this.atlas && !this.loader.textureManager.exists(this.key)) {
        addAtlasTexture(this.loader.textureManager, this.key, this.atlas);
      }
      if (this.loader.textureManager.exists(this.key)) releaseLookAtlas(this.request);
      this.atlas = null;
      this.onProcessComplete();
    }
  };
}

const lookFileClassCache: { current: ReturnType<typeof lookFileClass> | null } = { current: null };

function lookFile(
  loader: Phaser.Loader.LoaderPlugin,
  key: string,
  request: LookRequest
): Phaser.Loader.File {
  lookFileClassCache.current ??= lookFileClass();
  return new lookFileClassCache.current(loader, key, request);
}

export function preloadLooks(
  scene: Phaser.Scene,
  requests: readonly PlayerLookRequest[]
): ReadonlySet<string> {
  const needed = new Set<string>();
  for (const request of requests) {
    const key = lookTextureKey(request);
    if (key === null || needed.has(key)) continue;
    needed.add(key);
    if (!scene.textures.exists(key)) scene.load.addFile(lookFile(scene.load, key, request));
  }
  return needed;
}
