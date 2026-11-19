import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach } from "vitest";
import { MovementValidator } from "../../../src/game/validators/MovementValidator";
import { PlayerBuilder } from "../../utils/test-builders";
import { GameConfig } from "../../../src/config/GameConfig";
import { type Player, PlayerStatus } from "../../../src/types/Player";

describe("MovementValidator", () => {
  let validator: MovementValidator;
  let player: Player;
  let opponents: Player[];
  let teammates: Player[];

  beforeEach(() => {
    validator = new MovementValidator();

    player = new PlayerBuilder()
      .withId("p1")
      .withStats({ MA: 6, ST: 3, AG: 3, AV: 9, PA: 4 })
      .withGridPosition(5, 5)
      .withStatus(PlayerStatus.ACTIVE)
      .build();
    opponents = [];
    teammates = [];
  });

  describe("Basic Movement", () => {
    it("should validate a simple valid move within range", () => {
      const result = validator.findPath({ player: player, targetX: 8, targetY: 5, opponents: opponents, teammates: teammates });

      expect(result.valid).toBe(true);
      expect(result.path.length).toBe(3);
      expect(result.rolls).toHaveLength(0);

      expect(result.path[result.path.length - 1]).toEqual({ x: 8, y: 5 });
    });

    it("should invalidate move out of bounds", () => {
      const result = validator.findPath({ player: player, targetX: -1, targetY: 5, opponents: opponents, teammates: teammates });
      expect(result.valid).toBe(false);
    });

    it("should invalidate move to occupied square (standing player)", () => {
      const opponent = new PlayerBuilder()
        .withId("opp1")
        .withStatus(PlayerStatus.ACTIVE)
        .withGridPosition(6, 5)
        .build();
      opponents.push(opponent);

      const result = validator.findPath({ player: player, targetX: 6, targetY: 5, opponents: opponents, teammates: teammates });
      expect(result.valid).toBe(false);
    });
  });

  describe("Tackle Zones & Dodging", () => {
    it("should detect dodge requirement when leaving a tackle zone", () => {
      const opponent = new PlayerBuilder()
        .withId("opp1")
        .withStatus(PlayerStatus.ACTIVE)
        .withGridPosition(5, 6)
        .build();
      opponents.push(opponent);

      const result = validator.findPath({ player: player, targetX: 5, targetY: 4, opponents: opponents, teammates: teammates });

      expect(result.valid).toBe(true);
      expect(result.rolls).toHaveLength(1);
      expect(fixtureValue(result.rolls[0]).type).toBe("dodge");
      expect(fixtureValue(result.rolls[0]).target).toBe(3);
      expect(fixtureValue(result.rolls[0]).modifiers).toBe(0);
      expect(fixtureValue(result.rolls[0]).square).toEqual({ x: 5, y: 4 });
    });

    it("should calculate dodge modifiers correctly (dodging into a TZ)", () => {
      const opp1 = new PlayerBuilder()
        .withId("o1")
        .withStatus(PlayerStatus.ACTIVE)
        .withGridPosition(5, 6)
        .build();

      const opp2 = new PlayerBuilder()
        .withId("o2")
        .withStatus(PlayerStatus.ACTIVE)
        .withGridPosition(6, 6)
        .build();

      opponents = [opp1, opp2];

      const result = validator.findPath({ player: player, targetX: 6, targetY: 5, opponents: opponents, teammates: teammates });

      expect(result.rolls).toHaveLength(1);
      expect(fixtureValue(result.rolls[0]).type).toBe("dodge");
      expect(fixtureValue(result.rolls[0]).modifiers).toBe(-2);
    });
  });

  describe("Pathfinding (A*)", () => {
    it("should path around an obstacle", () => {
      const obstacle = new PlayerBuilder()
        .withId("obs")
        .withStatus(PlayerStatus.ACTIVE)
        .withGridPosition(6, 5)
        .build();
      opponents.push(obstacle);

      const result = validator.findPath({ player: player, targetX: 7, targetY: 5, opponents: opponents, teammates: teammates });

      expect(result.valid).toBe(true);
      expect(result.path.length).toBeGreaterThan(0);

      const passedThroughObstacle = result.path.some(
        (p) => p.x === 6 && p.y === 5
      );
      expect(passedThroughObstacle).toBe(false);

      expect(result.path[result.path.length - 1]).toEqual({ x: 7, y: 5 });
    });

    it("should fail if destination is unreachable (blocked)", () => {
      const coords = [
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 6, y: 4 },
        { x: 4, y: 5 },
        { x: 6, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
      ];
      opponents = coords.map((c, i) =>
        new PlayerBuilder()
          .withId(`o${String(i)}`)
          .withStatus(PlayerStatus.ACTIVE)
          .withGridPosition(c.x, c.y)
          .build()
      );

      const result = validator.findPath({ player: player, targetX: 8, targetY: 5, opponents: opponents, teammates: teammates });
      expect(result.valid).toBe(false);
    });
  });

  describe("GFI (Go For It)", () => {
    it("should generate rush rolls when exceeding MA", () => {
      const result = validator.findPath({ player: player, targetX: 12, targetY: 5, opponents: opponents, teammates: teammates });

      expect(result.valid).toBe(true);
      expect(result.rolls).toHaveLength(1);
      expect(fixtureValue(result.rolls[0]).type).toBe("rush");
      expect(fixtureValue(result.rolls[0]).target).toBe(2);
    });

    it("should invalidate move beyond MA + 2", () => {
      const result = validator.findPath({ player: player, targetX: 14, targetY: 5, opponents: opponents, teammates: teammates });
      expect(result.valid).toBe(false);
    });
  });

  describe("Reachable Squares", () => {
    it("should return all reachable squares within MA + 2", () => {
      const squares = validator.findReachableSquares(
        player,
        opponents,
        teammates
      );

      expect(squares.length).toBeGreaterThan(0);

      expect(squares).toContainEqual({ x: 6, y: 5, cost: 1 });

      expect(squares).not.toContainEqual({ x: 5, y: 5, cost: 0 });

      expect(squares).toContainEqual({ x: 13, y: 5, cost: 8 });

      expect(squares).not.toContainEqual({ x: 14, y: 5, cost: 9 });
    });

    it("should calculate reachable squares blocked by opponents", () => {
      const opponent = new PlayerBuilder()
        .withId("opp1")
        .withStatus(PlayerStatus.ACTIVE)
        .withGridPosition(6, 5)
        .build();
      opponents.push(opponent);

      const squares = validator.findReachableSquares(
        player,
        opponents,
        teammates
      );

      expect(squares).not.toContainEqual({ x: 6, y: 5, cost: 1 });

      expect(squares).toContainEqual({ x: 7, y: 5, cost: 2 });
    });

    it("reaches nothing from a square that is not on the grid", () => {
      const { PITCH_WIDTH: w, PITCH_HEIGHT: h } = GameConfig;
      for (const at of [
        { x: 5.5, y: 5 },
        { x: -1, y: 5 },
        { x: w, y: 5 },
        { x: 5, y: -1 },
        { x: 5, y: h },
      ]) {
        player.gridPosition = at;
        expect(
          validator.findReachableSquares(player, opponents, teammates),
          JSON.stringify(at)
        ).toEqual([]);
      }
    });
  });

  describe("Tackle zone fallback pathing", () => {
    it("still finds a path when every route passes through tackle zones", () => {
      for (let y = 0; y <= 10; y++) {
        if (y === 5) continue;
        opponents.push(
          new PlayerBuilder()
            .withId(`wall-${String(y)}`)
            .withStatus(PlayerStatus.ACTIVE)
            .withGridPosition(7, y)
            .build()
        );
      }

      const result = validator.findPath({ player: player, targetX: 9, targetY: 5, opponents: opponents, teammates: teammates });

      expect(result.valid).toBe(true);
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.path[result.path.length - 1]).toEqual({ x: 9, y: 5 });

      expect(result.rolls.some((r) => r.type === "dodge")).toBe(true);
    });

    it("takes the direct route when the detour would not fit the squares left", () => {
      for (const y of [4, 6])
        opponents.push(
          new PlayerBuilder()
            .withId(`flank-${String(y)}`)
            .withStatus(PlayerStatus.ACTIVE)
            .withGridPosition(7, y)
            .build()
        );

      const result = validator.findPath({ player: player, targetX: 8, targetY: 5, opponents: opponents, teammates: teammates, movementUsed: 5 });

      expect(result.valid).toBe(true);
      expect(result.path).toHaveLength(3);
      expect(result.path.at(-1)).toEqual({ x: 8, y: 5 });
      expect(result.rolls.filter((r) => r.type === "rush")).toHaveLength(2);
    });

    it("finds nothing past the squares left", () => {
      const result = validator.findPath({ player: player, targetX: 9, targetY: 5, opponents: opponents, teammates: teammates, movementUsed: 5 });
      expect(result.valid).toBe(false);
    });

    it("prefers the tackle-zone-free route when one exists in range", () => {
      opponents.push(
        new PlayerBuilder()
          .withId("lurker")
          .withStatus(PlayerStatus.ACTIVE)
          .withGridPosition(7, 4)
          .build()
      );

      const result = validator.findPath({ player: player, targetX: 9, targetY: 5, opponents: opponents, teammates: teammates });

      expect(result.valid).toBe(true);
      expect(result.rolls.filter((r) => r.type === "dodge")).toHaveLength(0);
    });
  });
});
