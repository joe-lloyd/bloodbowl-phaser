import { describe, it, expect, vi } from "vitest";
import { PlayerStatus } from "../../../src/types/Player";

/**
 * fix-foul-ko-sentoff-cleanup: Dugout gained a fourth section — Sent Off —
 * rendering ejected players (movePlayerToBox(..., "sent-off", ...)) with a
 * red-card marker distinct from Reserves/KO/Casualty. Exercising Dugout for
 * real means exercising Phaser.GameObjects.Container, but the shared
 * vitest-setup.ts stubs Phaser to bare `class {}` bodies (fine for classes
 * that only need static access, not for one that calls `.add()`/
 * `.setInteractive()` on itself). This suite installs a small functioning
 * fake Container/Scene, local to this file, so Dugout and PlayerSprite can
 * actually run their constructors.
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
  list: FakeGameObject[] = [];
  input: { cursor: string } | null = null;
  add(children: FakeGameObject | FakeGameObject[]) {
    const arr = Array.isArray(children) ? children : [children];
    this.list.push(...arr);
    return this;
  }
  bringToTop() {
    return this;
  }
  remove(child: FakeGameObject) {
    this.list = this.list.filter((c) => c !== child);
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
      circle: vi.fn(factory),
      graphics: vi.fn(factory),
      text: vi.fn(factory),
      sprite: vi.fn(factory),
      triangle: vi.fn(factory),
      polygon: vi.fn(factory),
      container: vi.fn(
        (_x?: number, _y?: number, children?: FakeGameObject[]) => {
          const c = new FakeContainer();
          if (children) c.add(children);
          return c;
        }
      ),
    },
    textures: { exists: vi.fn(() => false) },
    tweens: { add: vi.fn(), chain: vi.fn() },
    time: { delayedCall: vi.fn() },
    input: { setDraggable: vi.fn() },
  };
}

vi.mock("phaser", () => ({
  default: {
    GameObjects: { Container: FakeContainer },
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

describe("Dugout Sent Off section", () => {
  it("renders an ejected player with a distinguishing red-card marker", async () => {
    vi.resetModules();
    const { Dugout } = await import("../../../src/game/elements/Dugout");
    const scene = makeFakeScene();

    const sentOffPlayer = {
      id: "p1",
      playerName: "Ejected Guy",
      number: 4,
      positionName: "Lineman",
      status: PlayerStatus.REMOVED,
      gridPosition: undefined,
    };
    const team = makeTeam([sentOffPlayer]);

    const DugoutCtor = Dugout as unknown as new (
      scene: unknown,
      x: number,
      y: number,
      team: unknown,
      height?: number,
      mirrored?: boolean,
      themeId?: string
    ) => InstanceType<typeof Dugout>;
    const dugout = new DugoutCtor(scene, 0, 0, team, 150, false, "classic");

    const sprites = dugout.getSprites();
    const sprite = sprites.get("p1");
    expect(sprite).toBeDefined();

    // The red-card marker (see Dugout.addSentOffMarker) is drawn as a small
    // tinted, rotated rectangle and added as a child of the player's sprite —
    // distinct from the Reserves/KO/Casualty sections, which never call
    // scene.add.rectangle with this color for a player sprite.
    expect(scene.add.rectangle).toHaveBeenCalledWith(13, -13, 11, 15, 0xd0021b, 1);
    const card = scene.add.rectangle.mock.results.find(
      (r) => r.value && (r.value as FakeGameObject).angle === -10
    );
    expect(card).toBeDefined();
    expect((sprite as unknown as FakeContainer).list).toContain(card!.value);
  });

  it("does not add the marker to a Reserves player", async () => {
    vi.resetModules();
    const { Dugout } = await import("../../../src/game/elements/Dugout");
    const scene = makeFakeScene();

    const reservePlayer = {
      id: "p2",
      playerName: "Bench Guy",
      number: 9,
      positionName: "Lineman",
      status: PlayerStatus.RESERVE,
      gridPosition: undefined,
    };
    const team = makeTeam([reservePlayer]);

    const DugoutCtor = Dugout as unknown as new (
      scene: unknown,
      x: number,
      y: number,
      team: unknown,
      height?: number,
      mirrored?: boolean,
      themeId?: string
    ) => InstanceType<typeof Dugout>;
    new DugoutCtor(scene, 0, 0, team, 150, false, "classic");

    const cardCalls = scene.add.rectangle.mock.calls.filter(
      (call) => call[4] === 0xd0021b
    );
    expect(cardCalls).toHaveLength(0);
  });
});
