import { vi, beforeAll, afterEach } from "vitest";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })));
});

afterEach(() => {
  vi.clearAllMocks();
});

vi.mock("phaser", () => {
  return {
    default: {
      Math: {
        Easing: {
          Cubic: {
            InOut: vi.fn(),
          },
          Sine: {
            easeInOut: vi.fn(),
          },
        },
      },
      Events: {
        EventEmitter: class {
          on = vi.fn();
          off = vi.fn();
          emit = vi.fn();
          once = vi.fn();
        },
      },
      Geom: {
        Rectangle: class {
          static Contains = vi.fn();
          public x: number;
          public y: number;
          public width: number;
          public height: number;
          constructor(x: number, y: number, width: number, height: number) {
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
          }
        },
      },
      GameObjects: {
        Container: class {},
        Sprite: class {},
        Image: class {},
        Graphics: class {},
        Text: class {},
      },
      Scene: class {},
    },
  };
});
