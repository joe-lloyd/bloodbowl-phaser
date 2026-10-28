import { describe, it, expect, vi } from "vitest";
import { PlayerStatus } from "../../../src/types/Player";

/**
 * The dugout places each player on a square of their box in the stadium's
 * baked dugout (reserves, KO, injured, sent off), and marks a sent-off
 * player with a red card. The shared vitest-setup.ts stubs Phaser to bare
 * classes, so this suite installs a small working fake Container and Scene
 * for Dugout and PlayerSprite to run their constructors against.
 */

class FakeGameObject {
  x = 0;
  y = 0;
  angle = 0;
  visible = true;
  alpha = 1;
  name = "";
  setOrigin() {
    return this;
  }
  setStrokeStyle() {
    return this;
  }
  setName(name: string) {
    this.name = name;
    return this;
  }
  setAngle(a: number) {
    this.angle = a;
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  setSize() {
    return this;
  }
  setScale() {
    return this;
  }
  setAlpha(a: number) {
    this.alpha = a;
    return this;
  }
  setDepth() {
    return this;
  }
  lineStyle() {
    return this;
  }
  fillStyle() {
    return this;
  }
  fillRect() {
    return this;
  }
  strokeRect() {
    return this;
  }
  strokeCircle() {
    return this;
  }
  lineBetween() {
    return this;
  }
  on() {
    return this;
  }
}

class FakeContainer extends FakeGameObject {
  scene: unknown;
  constructor(scene?: unknown, x = 0, y = 0) {
    super();
    this.scene = scene;
    this.x = x;
    this.y = y;
  }
  list: FakeGameObject[] = [];
  input: { cursor: string } | null = null;
  displayOriginX = 0;
  displayOriginY = 0;
  add(children: FakeGameObject | FakeGameObject[]) {
    const arr = Array.isArray(children) ? children : [children];
    this.list.push(...arr);
    return this;
  }
  once() {
    return this;
  }
  setInteractive() {
    this.input = { cursor: "" };
    return this;
  }
}

function makeFakeScene() {
  const factory = () => new FakeGameObject();
  return {
    add: {
      existing: vi.fn(),
      rectangle: vi.fn(factory),
      ellipse: vi.fn(factory),
      circle: vi.fn(factory),
      graphics: vi.fn(factory),
      text: vi.fn(factory),
      sprite: vi.fn(factory),
      container: vi.fn(() => new FakeContainer()),
    },
    events: { on: vi.fn(), off: vi.fn() },
    textures: { exists: vi.fn(() => false) },
    tweens: { add: vi.fn(), chain: vi.fn() },
    time: { delayedCall: vi.fn(), now: 0 },
    input: { setDraggable: vi.fn() },
  };
}

vi.mock("phaser", () => ({
  default: {
    GameObjects: { Container: FakeContainer, Events: { DESTROY: "destroy" } },
    Scenes: { Events: { UPDATE: "update" } },
    Geom: {
      Rectangle: class {
        static Contains = vi.fn();
        constructor(
          public x: number,
          public y: number,
          public width: number,
          public height: number
        ) {}
      },
    },
  },
}));

function makeTeam(players: unknown[]) {
  return {
    id: "team1",
    name: "Test Team",
    rosterName: "Human",
    colors: { primary: 0xff0000, secondary: 0x000000 },
    coaches: 0,
    cheerleaders: 0,
    apothecary: false,
    dedicatedFans: 0,
    players,
  };
}

const SQUARES = {
  reserves: [
    [1.5, -1.5],
    [2.5, -1.5],
  ],
  ko: [[5.5, -1.5]],
  injured: [[8.5, -1.5]],
  "sent off": [[9.5, -1.5]],
};
/** A stand-in projection: ten pixels per grid unit. */
const toWorld = (gx: number, gy: number) => ({ x: gx * 10, y: gy * 10 });

function player(id: string, status: PlayerStatus) {
  return {
    id,
    playerName: id,
    number: 1,
    positionName: "Human Lineman",
    status,
    gridPosition: undefined,
  };
}

async function build(players: unknown[]) {
  vi.resetModules();
  const { Dugout } = await import("../../../src/game/elements/Dugout");
  const scene = makeFakeScene();
  const DugoutCtor = Dugout as unknown as new (...args: unknown[]) => {
    getSprites(): Map<string, FakeContainer>;
  };
  const dugout = new DugoutCtor(
    scene,
    makeTeam(players),
    SQUARES,
    toWorld,
    "bloodbowl",
    "s"
  );
  return { scene, sprites: dugout.getSprites() };
}

describe("Dugout", () => {
  it("stands each player on a square of their box", async () => {
    const { sprites } = await build([
      player("bench1", PlayerStatus.RESERVE),
      player("bench2", PlayerStatus.RESERVE),
      player("ko", PlayerStatus.KO),
      player("hurt", PlayerStatus.INJURED),
      player("off", PlayerStatus.REMOVED),
    ]);
    const at = (id: string) => [sprites.get(id)!.x, sprites.get(id)!.y];
    expect(at("bench1")).toEqual([15, -15]);
    expect(at("bench2")).toEqual([25, -15]);
    expect(at("ko")).toEqual([55, -15]);
    expect(at("hurt")).toEqual([85, -15]);
    expect(at("off")).toEqual([95, -15]);
  });

  it("marks a sent-off player with a red card", async () => {
    const { scene, sprites } = await build([
      player("off", PlayerStatus.REMOVED),
    ]);
    const card = scene.add.rectangle.mock.results.find(
      (r) => (r.value as FakeGameObject).angle === -10
    );
    expect(card).toBeDefined();
    expect(sprites.get("off")!.list).toContain(card!.value);
  });

  it("gives a reserve no red card", async () => {
    const { scene } = await build([player("bench", PlayerStatus.RESERVE)]);
    const cards = scene.add.rectangle.mock.calls.filter(
      (call) => call[4] === 0xd0021b
    );
    expect(cards).toHaveLength(0);
  });
});
