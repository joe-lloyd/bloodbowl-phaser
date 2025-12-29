import { vi } from "vitest";
import Phaser from "phaser";

export class MockGameObject implements Partial<Phaser.GameObjects.GameObject> {
  x: number = 0;
  y: number = 0;
  visible: boolean = true;
  active: boolean = true;
  alpha: number = 1;
  scene: Phaser.Scene;
  input: any = { enabled: false };

  constructor(scene: any, x: number = 0, y: number = 0) {
    this.scene = scene;
    this.x = x;
    this.y = y;
  }

  setInteractive = vi.fn().mockReturnThis();
  on = vi.fn().mockReturnThis();
  off = vi.fn().mockReturnThis();
  destroy = vi.fn();
  setVisible = vi.fn().mockImplementation((vis) => {
    this.visible = vis;
    return this;
  });
  setAlpha = vi.fn().mockImplementation((alpha) => {
    this.alpha = alpha;
    return this;
  });
  setPosition = vi.fn().mockImplementation((x, y) => {
    this.x = x;
    this.y = y;
    return this;
  });

  // Safety cast to satisfy specific checks if needed
  as<T>(): T {
    return this as unknown as T;
  }
}

export class MockSprite
  extends MockGameObject
  implements Partial<Phaser.GameObjects.Sprite>
{
  texture: Phaser.Textures.Texture | any;

  constructor(scene: any, x: number, y: number, texture: string) {
    super(scene, x, y);
    this.texture = { key: texture };
  }

  setTint = vi.fn().mockReturnThis();
  play = vi.fn().mockReturnThis();
  setFlipX = vi.fn().mockReturnThis();
}

export class MockText
  extends MockGameObject
  implements Partial<Phaser.GameObjects.Text>
{
  text: string;
  style: Phaser.Types.GameObjects.Text.TextStyle | any;

  constructor(scene: any, x: number, y: number, text: string, style: any) {
    super(scene, x, y);
    this.text = text;
    this.style = style || {};
  }

  setText = vi.fn().mockImplementation((text) => {
    this.text = text;
    return this;
  });
  setStyle = vi.fn().mockImplementation((style) => {
    this.style = { ...this.style, ...style };
    return this;
  });
}

export class MockGraphics
  extends MockGameObject
  implements Partial<Phaser.GameObjects.Graphics>
{
  lineStyle = vi.fn().mockReturnThis();
  fillStyle = vi.fn().mockReturnThis();
  strokeRect = vi.fn().mockReturnThis();
  fillRect = vi.fn().mockReturnThis();
  strokeCircle = vi.fn().mockReturnThis();
  lineBetween = vi.fn().mockReturnThis();
  clear = vi.fn().mockReturnThis();
}

export class MockContainer
  extends MockGameObject
  implements Partial<Phaser.GameObjects.Container>
{
  list: any[] = [];

  add = vi.fn().mockImplementation((child) => {
    if (Array.isArray(child)) {
      this.list.push(...child);
    } else {
      this.list.push(child);
    }
    return this;
  });

  remove = vi.fn();
  removeAll = vi.fn().mockImplementation(() => {
    this.list = [];
    return this;
  });
  getAll = vi.fn().mockReturnValue(this.list);
}

export class MockScene implements Partial<Phaser.Scene> {
  sys: any;
  events: any;
  input: any;
  tweens: any;
  cameras: any;
  children: any;
  // Helper to access factory methods which are usually on 'add' or 'make' property,
  // but in tests we often access scene.add.sprite directly.
  // We implement the 'add' property to match Phaser's Scene factory.
  add: any;
  make: any;
  data: any;

  constructor() {
    this.sys = {
      game: {
        config: { width: 800, height: 600 },
        events: { on: vi.fn(), emit: vi.fn() },
      },
      displayList: { add: vi.fn(), remove: vi.fn() },
      updateList: { add: vi.fn(), remove: vi.fn() },
      settings: { data: {} },
    };

    this.events = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      once: vi.fn(),
    };

    this.input = {
      on: vi.fn(),
      off: vi.fn(),
      keyboard: {
        createCursorKeys: vi.fn().mockReturnValue({
          up: { isDown: false },
          down: { isDown: false },
          left: { isDown: false },
          right: { isDown: false },
          space: { isDown: false },
        }),
        addKey: vi.fn().mockReturnValue({ isDown: false }),
      },
    };

    this.tweens = {
      add: vi.fn().mockReturnValue({ play: vi.fn(), stop: vi.fn() }),
    };

    this.cameras = {
      main: {
        width: 800,
        height: 600,
        scrollX: 0,
        scrollY: 0,
        startFollow: vi.fn(),
        setZoom: vi.fn(),
      },
    };

    this.children = {
      add: vi.fn(),
      removeAll: vi.fn(),
    };

    this.data = {
      get: vi.fn(),
      set: vi.fn(),
    };

    // Factories
    this.add = {
      sprite: vi.fn(
        (x, y, texture) =>
          new MockSprite(this as unknown as Phaser.Scene, x, y, texture)
      ),
      image: vi.fn(
        (x, y, texture) =>
          new MockSprite(this as unknown as Phaser.Scene, x, y, texture)
      ),
      text: vi.fn(
        (x, y, text, style) =>
          new MockText(this as unknown as Phaser.Scene, x, y, text, style)
      ),
      rectangle: vi.fn(
        () => new MockGameObject(this as unknown as Phaser.Scene)
      ),
      circle: vi.fn(() => new MockGameObject(this as unknown as Phaser.Scene)),
      graphics: vi.fn(() => new MockGraphics(this as unknown as Phaser.Scene)),
      container: vi.fn(
        (x, y) => new MockContainer(this as unknown as Phaser.Scene, x, y)
      ),
      existing: vi.fn((obj: any) => obj),
    };

    this.make = {
      graphics: vi.fn(() => new MockGraphics(this as unknown as Phaser.Scene)),
      text: vi.fn(
        (config: any) =>
          new MockText(
            this as unknown as Phaser.Scene,
            config.x,
            config.y,
            config.text,
            config.style
          )
      ),
    };
  }
}
