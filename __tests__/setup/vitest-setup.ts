import { vi, beforeAll, afterEach } from 'vitest';

// Global mocks
beforeAll(() => {
    // Mock window properties if missing (JSDOM handles most, but some Phaser needs might be missing)
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
    }));
});

// Reset mocks after each test
afterEach(() => {
    vi.clearAllMocks();
});

// Mock Phaser Global
// We don't necessarily need to mock the entire global Phaser object if we inject dependencies,
// but it helps for static access if any class directly uses Phaser.Math, etc.
vi.mock('phaser', () => {
    return {
        default: {
            Events: {
                EventEmitter: class {
                    on = vi.fn();
                    off = vi.fn();
                    emit = vi.fn();
                    once = vi.fn();
                }
            },
            GameObjects: {
                Container: class { },
                Sprite: class { },
                Image: class { },
                Graphics: class { },
                Text: class { }
            },
            Scene: class {
                sys = { settings: { data: {} } };
                add = {
                    container: vi.fn(),
                    sprite: vi.fn(),
                    text: vi.fn(),
                    rectangle: vi.fn(),
                    graphics: vi.fn()
                };
                make = {
                    graphics: vi.fn(),
                    text: vi.fn()
                };
                events = { on: vi.fn(), emit: vi.fn() };
                cameras = { main: { width: 800, height: 600 } };
            }
        }
    };
});
