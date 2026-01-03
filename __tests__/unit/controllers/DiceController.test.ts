import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";
import { DiceController } from "../../../src/game/controllers/DiceController";
import { RNGService } from "../../../src/services/rng/RNGService";
import { EventBus, IEventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import {
  findSeedForDiceSequence,
  findSeedForBlockOutcome,
  findSeedForInjuryChain,
} from "../../utils/seed-finder";

describe("DiceController", () => {
  let eventBus: IEventBus;
  let rng: RNGService;
  let controller: DiceController;
  let emitSpy: any;

  beforeEach(() => {
    eventBus = new EventBus();
    rng = new RNGService(12345); // Fixed seed for determinism
    controller = new DiceController(eventBus, rng);
    emitSpy = vi.spyOn(eventBus, "emit");
  });

  describe("Determinism Tests", () => {
    it("should produce identical results with the same seed", () => {
      const seed = 42;

      // First run
      const rng1 = new RNGService(seed);
      const controller1 = new DiceController(new EventBus(), rng1);
      const result1 = controller1.rollD6("Test");

      // Second run with same seed
      const rng2 = new RNGService(seed);
      const controller2 = new DiceController(new EventBus(), rng2);
      const result2 = controller2.rollD6("Test");

      expect(result1).toBe(result2);
    });

    it("should produce consistent sequence across multiple rolls", () => {
      const seed = 999;

      // Run 1
      const rng1 = new RNGService(seed);
      const controller1 = new DiceController(new EventBus(), rng1);
      const sequence1 = [
        controller1.rollD6("Roll 1"),
        controller1.rollD6("Roll 2"),
        controller1.rollD6("Roll 3"),
      ];

      // Run 2
      const rng2 = new RNGService(seed);
      const controller2 = new DiceController(new EventBus(), rng2);
      const sequence2 = [
        controller2.rollD6("Roll 1"),
        controller2.rollD6("Roll 2"),
        controller2.rollD6("Roll 3"),
      ];

      expect(sequence1).toEqual(sequence2);
    });

    it("should produce different results with different seeds", () => {
      const rng1 = new RNGService(100);
      const controller1 = new DiceController(new EventBus(), rng1);

      const rng2 = new RNGService(200);
      const controller2 = new DiceController(new EventBus(), rng2);

      // Compare sequences instead of single rolls to avoid false positives
      const sequence1 = [
        controller1.rollD6("Test"),
        controller1.rollD6("Test"),
        controller1.rollD6("Test"),
      ];

      const sequence2 = [
        controller2.rollD6("Test"),
        controller2.rollD6("Test"),
        controller2.rollD6("Test"),
      ];

      expect(sequence1).not.toEqual(sequence2);
    });
  });

  describe("rollD6", () => {
    it("should return a value between 1 and 6", () => {
      const roll = controller.rollD6("Test Roll");
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
    });

    it("should emit DiceRoll event", () => {
      const roll = controller.rollD6("Test Roll", "team1");

      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Test Roll",
          diceType: "1d6",
          value: roll,
          total: roll,
          teamId: "team1",
          resultState: "none",
        })
      );
    });
  });

  describe("roll2D6", () => {
    it("should return a sum between 2 and 12", () => {
      const roll = controller.roll2D6("Test Roll");
      expect(roll).toBeGreaterThanOrEqual(2);
      expect(roll).toBeLessThanOrEqual(12);
    });

    it("should emit DiceRoll event with array value", () => {
      controller.roll2D6("Test Roll", "team1");

      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Test Roll",
          diceType: "2d6",
          value: expect.arrayContaining([
            expect.any(Number),
            expect.any(Number),
          ]),
          teamId: "team1",
        })
      );
    });

    it("should return sum of both dice", () => {
      // Use a known seed to get predictable results
      const testRng = new RNGService(555);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.roll2D6("Test");
      // The result should be >= 2 and <= 12
      expect(result).toBeGreaterThanOrEqual(2);
      expect(result).toBeLessThanOrEqual(12);
    });
  });

  describe("rollD8", () => {
    it("should return a value between 1 and 8", () => {
      const roll = controller.rollD8("Scatter");
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(8);
    });

    it("should emit DiceRoll event", () => {
      const roll = controller.rollD8("Scatter", "team1");

      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Scatter",
          diceType: "1d8",
          value: roll,
        })
      );
    });
  });

  describe("rollD16", () => {
    it("should return a value between 1 and 16", () => {
      const roll = controller.rollD16("Casualty");
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(16);
    });

    it("should emit DiceRoll event", () => {
      const roll = controller.rollD16("Casualty", "team1");

      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Casualty",
          diceType: "1d16",
          value: roll,
        })
      );
    });
  });

  describe("rollMultipleD6", () => {
    it("should return correct number of dice", () => {
      const rolls = controller.rollMultipleD6("Test", 3);
      expect(rolls).toHaveLength(3);
    });

    it("should return values between 1 and 6", () => {
      const rolls = controller.rollMultipleD6("Test", 5);
      rolls.forEach((roll) => {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      });
    });

    it("should emit DiceRoll event with total", () => {
      controller.rollMultipleD6("Test", 3, "team1");

      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Test",
          diceType: "3d6",
          value: expect.any(Array),
          total: expect.any(Number),
        })
      );
    });
  });

  describe("rollBlockDice", () => {
    it("should return correct number of block results", () => {
      const results = controller.rollBlockDice(2);
      expect(results).toHaveLength(2);
    });

    it("should return valid block results", () => {
      const results = controller.rollBlockDice(3);
      const validTypes = [
        "skull",
        "both-down",
        "push",
        "pow",
        "pow-dodge",
      ] as const;

      results.forEach((result) => {
        expect(validTypes).toContain(result.type);
        expect(result.icon).toBeTruthy();
        expect(result.label).toBeTruthy();
      });
    });

    it("should emit DiceRoll event with block results", () => {
      controller.rollBlockDice(2, "team1");

      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Block Roll",
          diceType: "2D Block",
          teamId: "team1",
        })
      );
    });
  });

  describe("rollSkillCheck", () => {
    it("should return success when roll meets target", () => {
      // Find a seed that rolls a 4
      const seedResult = findSeedForDiceSequence([4]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck("Dodge", 4, 0);

      expect(result.roll).toBe(4);
      expect(result.effectiveTotal).toBe(4);
      expect(result.success).toBe(true);
    });

    it("should return failure when roll is below target", () => {
      // Find a seed that rolls a 2
      const seedResult = findSeedForDiceSequence([2]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck("Dodge", 4, 0);

      expect(result.roll).toBe(2);
      expect(result.success).toBe(false);
    });

    it("should apply positive modifiers", () => {
      // Find a seed that rolls a 3
      const seedResult = findSeedForDiceSequence([3]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck("Dodge", 5, 2);

      expect(result.roll).toBe(3);
      expect(result.effectiveTotal).toBe(5); // 3 + 2
      expect(result.success).toBe(true);
    });

    it("should apply negative modifiers", () => {
      // Find a seed that rolls a 4
      const seedResult = findSeedForDiceSequence([4]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck("Dodge", 5, -2);

      expect(result.roll).toBe(4);
      expect(result.effectiveTotal).toBe(2); // 4 - 2
      expect(result.success).toBe(false);
    });

    it("should always succeed on natural 6", () => {
      // Find a seed that rolls a 6
      const seedResult = findSeedForDiceSequence([6]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck("Dodge", 10, -5);

      expect(result.roll).toBe(6);
      expect(result.success).toBe(true);
    });

    it("should always fail on natural 1", () => {
      // Find a seed that rolls a 1
      const seedResult = findSeedForDiceSequence([1]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck("Dodge", 2, 5);

      expect(result.roll).toBe(1);
      expect(result.success).toBe(false);
    });

    it("should emit DiceRoll event with success state", () => {
      controller.rollSkillCheck("Dodge", 3, 0, "Player 1", "team1");

      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Dodge (Player 1)",
          diceType: "1d6",
          teamId: "team1",
          resultState: expect.stringMatching(/success|failure/),
        })
      );
    });
  });

  describe("rollArmorCheck", () => {
    it("should return broken: true when roll meets armor value", () => {
      // Find a seed that produces 2d6 totaling 10 or more
      // We need the sum of two sequential D6 rolls to be >= 10
      const seedResult = findSeedForDiceSequence([5, 5]); // 10 total
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollArmorCheck(10);

      expect(result.roll).toBe(10);
      expect(result.broken).toBe(true);
    });

    it("should return broken: false when roll is below armor value", () => {
      // Find a seed that produces low 2d6 total
      const seedResult = findSeedForDiceSequence([1, 1]); // 2 total
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollArmorCheck(10);

      expect(result.roll).toBe(2);
      expect(result.broken).toBe(false);
    });

    it("should return individual dice rolls", () => {
      const result = controller.rollArmorCheck(9);

      expect(result.rolls).toHaveLength(2);
      expect(result.rolls[0]).toBeGreaterThanOrEqual(1);
      expect(result.rolls[0]).toBeLessThanOrEqual(6);
      expect(result.rolls[1]).toBeGreaterThanOrEqual(1);
      expect(result.rolls[1]).toBeLessThanOrEqual(6);
      expect(result.roll).toBe(result.rolls[0] + result.rolls[1]);
    });

    it("should emit DiceRoll event", () => {
      controller.rollArmorCheck(9, "Player 1", "team1");

      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Armor Check",
          diceType: "2d6",
          teamId: "team1",
          resultState: expect.stringMatching(/success|failure/),
        })
      );
    });
  });

  describe("rollInjury", () => {
    it("should return total between 2 and 12", () => {
      const result = controller.rollInjury();
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeLessThanOrEqual(12);
    });

    it("should return individual dice rolls", () => {
      const result = controller.rollInjury("Player 1", "team1");

      expect(result.rolls).toHaveLength(2);
      expect(result.rolls[0]).toBeGreaterThanOrEqual(1);
      expect(result.rolls[0]).toBeLessThanOrEqual(6);
      expect(result.rolls[1]).toBeGreaterThanOrEqual(1);
      expect(result.rolls[1]).toBeLessThanOrEqual(6);
      expect(result.total).toBe(result.rolls[0] + result.rolls[1]);
    });

    it("should emit DiceRoll event", () => {
      controller.rollInjury("Player 1", "team1");

      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Injury Roll",
          diceType: "2d6",
          teamId: "team1",
        })
      );
    });
  });

  describe("Complex Scenarios with Seed Finder", () => {
    it("should find seed for specific block outcome", () => {
      const seedResult = findSeedForBlockOutcome(["pow"]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      const results = testController.rollBlockDice(1);
      expect(results[0].type).toBe("pow");
    });

    it("should find seed for double POW on 2D block", () => {
      const seedResult = findSeedForBlockOutcome(["pow", "pow"]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      const results = testController.rollBlockDice(2);
      expect(results[0].type).toBe("pow");
      expect(results[1].type).toBe("pow");
    });

    it("should find seed for player injury scenario (armor break)", () => {
      const seedResult = findSeedForInjuryChain({
        blockResult: "pow",
        armorTarget: 9,
        armorBreak: true,
        injuryTotal: 8,
      });

      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      // Verify the sequence
      const blockResults = testController.rollBlockDice(1);
      expect(blockResults[0].type).toBe("pow");

      const armorCheck = testController.rollArmorCheck(9);
      expect(armorCheck.broken).toBe(true);

      const injury = testController.rollInjury();
      expect(injury.total).toBeGreaterThanOrEqual(8);
    });

    it("should find seed for player death scenario", () => {
      const seedResult = findSeedForInjuryChain({
        blockResult: "pow",
        armorTarget: 8,
        armorBreak: true,
        injuryTotal: 10,
        casualtyRoll: 15,
      });

      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(seedResult!.seed);
      const testController = new DiceController(new EventBus(), testRng);

      // Verify complete death sequence
      const blockResults = testController.rollBlockDice(1);
      expect(blockResults[0].type).toBe("pow");

      const armorCheck = testController.rollArmorCheck(8);
      expect(armorCheck.broken).toBe(true);

      const injury = testController.rollInjury();
      expect(injury.total).toBeGreaterThanOrEqual(10);

      // Casualty roll (using RNG directly since DiceController uses rollD16)
      const casualtyRoll = testRng.rollDie(16);
      expect(casualtyRoll).toBe(15);
    });

    it("should produce consistent multi-roll sequences", () => {
      const seed = 777;

      // First run: simulate a turn with dodge, block, armor, injury
      const rng1 = new RNGService(seed);
      const controller1 = new DiceController(new EventBus(), rng1);

      const dodge1 = controller1.rollSkillCheck("Dodge", 3, 0);
      const block1 = controller1.rollBlockDice(2);
      const armor1 = controller1.rollArmorCheck(9);
      const injury1 = controller1.rollInjury();

      // Second run with same seed
      const rng2 = new RNGService(seed);
      const controller2 = new DiceController(new EventBus(), rng2);

      const dodge2 = controller2.rollSkillCheck("Dodge", 3, 0);
      const block2 = controller2.rollBlockDice(2);
      const armor2 = controller2.rollArmorCheck(9);
      const injury2 = controller2.rollInjury();

      // All results should match
      expect(dodge1).toEqual(dodge2);
      expect(block1).toEqual(block2);
      expect(armor1).toEqual(armor2);
      expect(injury1).toEqual(injury2);
    });
  });

  describe("Seed State Management", () => {
    it("should track seed changes as rolls occur", () => {
      const initialSeed = rng.getSeed();

      controller.rollD6("Test");

      const afterRollSeed = rng.getSeed();

      expect(afterRollSeed).not.toBe(initialSeed);
    });

    it("should include current seed in event emissions", () => {
      controller.rollD6("Test");

      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          seed: expect.any(Number),
        })
      );
    });
  });
});
