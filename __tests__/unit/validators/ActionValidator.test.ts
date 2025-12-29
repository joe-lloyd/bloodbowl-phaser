import { describe, it, expect, beforeEach } from "vitest";
import { ActionValidator } from "../../../src/game/validators/ActionValidator";
import { PlayerBuilder } from "../../utils/test-builders";

describe("ActionValidator", () => {
  let validator: ActionValidator;
  const attacker = new PlayerBuilder().withId("atk").withGridPosition(5, 5).build();
  const defender = new PlayerBuilder().withId("def").withGridPosition(6, 5).build();

  beforeEach(() => {
    validator = new ActionValidator();
  });

  describe("Block Action", () => {
    it("should allow block on adjacent calling player", () => {
      const result = validator.validateAction("block", attacker, defender);
      expect(result.valid).toBe(true);
    });

    it("should prevent block on non-adjacent player", () => {
      attacker.gridPosition = { x: 5, y: 5 };
      defender.gridPosition = { x: 7, y: 5 }; // Gap of 1
      const result = validator.validateAction("block", attacker, defender);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("adjacent");
    });
  });

  describe("Pass Action", () => {
    it("should allow pass (basic check)", () => {
      const result = validator.validateAction("pass", attacker, {
        x: 10,
        y: 10,
      });
      expect(result.valid).toBe(true);
    });
  });
});
