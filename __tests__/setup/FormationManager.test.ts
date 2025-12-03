import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FormationManager } from "../../src/game/setup/FormationManager";
import { FormationPosition } from "../../src/types/SetupTypes";

describe("FormationManager", () => {
  let manager: FormationManager;
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {};

    global.localStorage = {
      getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
      clear: vi.fn(() => {
        mockLocalStorage = {};
      }),
      length: 0,
      key: vi.fn(),
    } as Storage;

    manager = new FormationManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("saveFormation", () => {
    it("should save a formation to localStorage", () => {
      const positions: FormationPosition[] = [
        { playerId: "1", x: 0, y: 0 },
        { playerId: "2", x: 1, y: 1 },
      ];

      manager.saveFormation("team1", positions, "test-formation");

      expect(localStorage.setItem).toHaveBeenCalled();
      const saved = JSON.parse(mockLocalStorage["bloodbowl_formations"]);
      expect(saved.team1).toHaveLength(1);
      expect(saved.team1[0].name).toBe("test-formation");
      expect(saved.team1[0].positions).toEqual(positions);
    });

    it("should overwrite existing formation with same name", () => {
      const positions1: FormationPosition[] = [{ playerId: "1", x: 0, y: 0 }];
      const positions2: FormationPosition[] = [{ playerId: "2", x: 1, y: 1 }];

      manager.saveFormation("team1", positions1, "test");
      manager.saveFormation("team1", positions2, "test");

      const saved = JSON.parse(mockLocalStorage["bloodbowl_formations"]);
      expect(saved.team1).toHaveLength(1);
      expect(saved.team1[0].positions).toEqual(positions2);
    });

    it("should allow multiple formations for same team", () => {
      const positions1: FormationPosition[] = [{ playerId: "1", x: 0, y: 0 }];
      const positions2: FormationPosition[] = [{ playerId: "2", x: 1, y: 1 }];

      manager.saveFormation("team1", positions1, "formation1");
      manager.saveFormation("team1", positions2, "formation2");

      const saved = JSON.parse(mockLocalStorage["bloodbowl_formations"]);
      expect(saved.team1).toHaveLength(2);
    });

    it("should deep copy positions", () => {
      const positions: FormationPosition[] = [{ playerId: "1", x: 0, y: 0 }];

      manager.saveFormation("team1", positions, "test");
      positions[0].x = 999; // Modify original

      const loaded = manager.loadFormation("team1", "test");
      expect(loaded![0].x).toBe(0); // Should not be affected
    });
  });

  describe("loadFormation", () => {
    it("should load a saved formation", () => {
      const positions: FormationPosition[] = [
        { playerId: "1", x: 0, y: 0 },
        { playerId: "2", x: 1, y: 1 },
      ];

      manager.saveFormation("team1", positions, "test");
      const loaded = manager.loadFormation("team1", "test");

      expect(loaded).toEqual(positions);
    });

    it("should return null for non-existent formation", () => {
      const loaded = manager.loadFormation("team1", "nonexistent");
      expect(loaded).toBeNull();
    });

    it("should return null for non-existent team", () => {
      const loaded = manager.loadFormation("nonexistent-team", "test");
      expect(loaded).toBeNull();
    });

    it("should deep copy loaded positions", () => {
      const positions: FormationPosition[] = [{ playerId: "1", x: 0, y: 0 }];

      manager.saveFormation("team1", positions, "test");
      const loaded = manager.loadFormation("team1", "test");
      loaded![0].x = 999; // Modify loaded

      const loadedAgain = manager.loadFormation("team1", "test");
      expect(loadedAgain![0].x).toBe(0); // Should not be affected
    });
  });

  describe("listFormations", () => {
    it("should list all formation names for a team", () => {
      manager.saveFormation("team1", [], "formation1");
      manager.saveFormation("team1", [], "formation2");
      manager.saveFormation("team1", [], "formation3");

      const names = manager.listFormations("team1");
      expect(names).toEqual(["formation1", "formation2", "formation3"]);
    });

    it("should return empty array for team with no formations", () => {
      const names = manager.listFormations("team1");
      expect(names).toEqual([]);
    });

    it("should not include other teams formations", () => {
      manager.saveFormation("team1", [], "formation1");
      manager.saveFormation("team2", [], "formation2");

      const team1Names = manager.listFormations("team1");
      expect(team1Names).toEqual(["formation1"]);
    });
  });

  describe("deleteFormation", () => {
    it("should delete a formation", () => {
      manager.saveFormation("team1", [], "test");
      const deleted = manager.deleteFormation("team1", "test");

      expect(deleted).toBe(true);
      expect(manager.loadFormation("team1", "test")).toBeNull();
    });

    it("should return false if formation does not exist", () => {
      const deleted = manager.deleteFormation("team1", "nonexistent");
      expect(deleted).toBe(false);
    });

    it("should return false if team does not exist", () => {
      const deleted = manager.deleteFormation("nonexistent-team", "test");
      expect(deleted).toBe(false);
    });

    it("should not affect other formations", () => {
      manager.saveFormation("team1", [], "formation1");
      manager.saveFormation("team1", [], "formation2");

      manager.deleteFormation("team1", "formation1");

      expect(manager.loadFormation("team1", "formation2")).not.toBeNull();
    });
  });

  describe("getDefaultFormation", () => {
    it("should return 7 positions for Team 1", () => {
      const formation = manager.getDefaultFormation(true);
      expect(formation).toHaveLength(7);
    });

    it("should return 7 positions for Team 2", () => {
      const formation = manager.getDefaultFormation(false);
      expect(formation).toHaveLength(7);
    });

    it("should place Team 1 players on left side (x: 0-5)", () => {
      const formation = manager.getDefaultFormation(true);
      formation.forEach((pos) => {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThanOrEqual(5);
      });
    });

    it("should place Team 2 players on right side (x: 14-19)", () => {
      const formation = manager.getDefaultFormation(false);
      formation.forEach((pos) => {
        expect(pos.x).toBeGreaterThanOrEqual(14);
        expect(pos.x).toBeLessThanOrEqual(19);
      });
    });

    it("should have unique positions", () => {
      const formation = manager.getDefaultFormation(true);
      const positionSet = new Set(formation.map((p) => `${p.x},${p.y}`));
      expect(positionSet.size).toBe(7);
    });
  });

  describe("clearFormations", () => {
    it("should clear all formations for a team", () => {
      manager.saveFormation("team1", [], "formation1");
      manager.saveFormation("team1", [], "formation2");

      manager.clearFormations("team1");

      expect(manager.listFormations("team1")).toEqual([]);
    });

    it("should not affect other teams", () => {
      manager.saveFormation("team1", [], "formation1");
      manager.saveFormation("team2", [], "formation2");

      manager.clearFormations("team1");

      expect(manager.listFormations("team2")).toEqual(["formation2"]);
    });

    it("should handle clearing non-existent team", () => {
      expect(() => manager.clearFormations("nonexistent")).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle localStorage errors gracefully when loading", () => {
      vi.spyOn(localStorage, "getItem").mockImplementation(() => {
        throw new Error("Storage error");
      });

      const result = manager.loadFormation("team1", "test");
      expect(result).toBeNull();
    });

    it("should handle localStorage errors gracefully when saving", () => {
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("Storage error");
      });

      expect(() => {
        manager.saveFormation("team1", [], "test");
      }).not.toThrow();
    });

    it("should handle corrupted localStorage data", () => {
      mockLocalStorage["bloodbowl_formations"] = "invalid json{{{";

      const result = manager.loadFormation("team1", "test");
      expect(result).toBeNull();
    });
  });
});
