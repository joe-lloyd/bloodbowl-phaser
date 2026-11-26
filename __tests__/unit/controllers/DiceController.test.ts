import { observeEmit } from "./controllerFixtures";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach } from "vitest";
import { DiceController } from "../../../src/game/controllers/DiceController";
import { RNGService } from "../../../src/services/rng/RNGService";
import { EventBus, type IEventBus } from "../../../src/services/EventBus";
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
  let emitSpy: ReturnType<typeof observeEmit>;

  beforeEach(() => {
    eventBus = new EventBus();
    rng = new RNGService(12_345);
    controller = new DiceController(eventBus, rng);
    emitSpy = observeEmit(eventBus);
  });

  describe("Determinism Tests", () => {
    it("should produce identical results with the same seed", () => {
      const seed = 42;

      const rng1 = new RNGService(seed);
      const controller1 = new DiceController(new EventBus(), rng1);
      const result1 = controller1.rollD6("Test");

      const rng2 = new RNGService(seed);
      const controller2 = new DiceController(new EventBus(), rng2);
      const result2 = controller2.rollD6("Test");

      expect(result1).toBe(result2);
    });

    it("should produce consistent sequence across multiple rolls", () => {
      const seed = 999;

      const rng1 = new RNGService(seed);
      const controller1 = new DiceController(new EventBus(), rng1);
      const sequence1 = [
        controller1.rollD6("Roll 1"),
        controller1.rollD6("Roll 2"),
        controller1.rollD6("Roll 3"),
      ];

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
      const testRng = new RNGService(555);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.roll2D6("Test");

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
      const seedResult = findSeedForDiceSequence([4]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck({ reason: "Dodge",target: 4,modifier: 0 });

      expect(result.roll).toBe(4);
      expect(result.effectiveTotal).toBe(4);
      expect(result.success).toBe(true);
    });

    it("should return failure when roll is below target", () => {
      const seedResult = findSeedForDiceSequence([2]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck({ reason: "Dodge",target: 4,modifier: 0 });

      expect(result.roll).toBe(2);
      expect(result.success).toBe(false);
    });

    it("should apply positive modifiers", () => {
      const seedResult = findSeedForDiceSequence([3]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck({ reason: "Dodge",target: 5,modifier: 2 });

      expect(result.roll).toBe(3);
      expect(result.effectiveTotal).toBe(5);
      expect(result.success).toBe(true);
    });

    it("should apply negative modifiers", () => {
      const seedResult = findSeedForDiceSequence([4]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck({ reason: "Dodge",target: 5,modifier: -2 });

      expect(result.roll).toBe(4);
      expect(result.effectiveTotal).toBe(2);
      expect(result.success).toBe(false);
    });

    it("caps a modified total at 6", () => {
      const testRng = new RNGService(fixtureValue(findSeedForDiceSequence([5])).seed);
      const testController = new DiceController(eventBus, testRng);

      const result = testController.rollSkillCheck({ reason: "Catch",target: 4,modifier: 2 });

      expect(result.roll).toBe(5);
      expect(result.effectiveTotal).toBe(6);
      expect(emitSpy).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({ value: 5, total: 6 })
      );
    });

    it("keeps a modified total below 1", () => {
      const testRng = new RNGService(fixtureValue(findSeedForDiceSequence([2])).seed);
      const testController = new DiceController(eventBus, testRng);

      const result = testController.rollSkillCheck({ reason: "Dodge",target: 3,modifier: -3 });

      expect(result.roll).toBe(2);
      expect(result.effectiveTotal).toBe(-1);
      expect(result.success).toBe(false);
    });

    it("should always succeed on natural 6", () => {
      const seedResult = findSeedForDiceSequence([6]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck({ reason: "Dodge",target: 10,modifier: -5 });

      expect(result.roll).toBe(6);
      expect(result.success).toBe(true);
    });

    it("should always fail on natural 1", () => {
      const seedResult = findSeedForDiceSequence([1]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollSkillCheck({ reason: "Dodge",target: 2,modifier: 5 });

      expect(result.roll).toBe(1);
      expect(result.success).toBe(false);
    });

    it("should emit DiceRoll event with success state", () => {
      controller.rollSkillCheck({ reason: "Dodge",target: 3,modifier: 0,playerName: "Player 1",teamId: "team1" });

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
      const seedResult = findSeedForDiceSequence([5, 5]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollArmorCheck({ av: 10 });

      expect(result.roll).toBe(10);
      expect(result.broken).toBe(true);
    });

    it("should return broken: false when roll is below armor value", () => {
      const seedResult = findSeedForDiceSequence([1, 1]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const result = testController.rollArmorCheck({ av: 10 });

      expect(result.roll).toBe(2);
      expect(result.broken).toBe(false);
    });

    it("should return individual dice rolls", () => {
      const result = controller.rollArmorCheck({ av: 9 });

      expect(result.rolls).toHaveLength(2);
      expect(result.rolls[0]).toBeGreaterThanOrEqual(1);
      expect(result.rolls[0]).toBeLessThanOrEqual(6);
      expect(result.rolls[1]).toBeGreaterThanOrEqual(1);
      expect(result.rolls[1]).toBeLessThanOrEqual(6);
      expect(result.roll).toBe(fixtureValue(result.rolls[0]) + fixtureValue(result.rolls[1]));
    });

    it("should emit DiceRoll event", () => {
      controller.rollArmorCheck({ av: 9,playerName: "Player 1",teamId: "team1" });

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
      expect(result.total).toBe(fixtureValue(result.rolls[0]) + fixtureValue(result.rolls[1]));
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

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const results = testController.rollBlockDice(1);
      expect(fixtureValue(results[0]).type).toBe("pow");
    });

    it("should find seed for double POW on 2D block", () => {
      const seedResult = findSeedForBlockOutcome(["pow", "pow"]);
      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const results = testController.rollBlockDice(2);
      expect(fixtureValue(results[0]).type).toBe("pow");
      expect(fixtureValue(results[1]).type).toBe("pow");
    });

    it("should find seed for player injury scenario (armor break)", () => {
      const seedResult = findSeedForInjuryChain({
        blockResult: "pow",
        armorTarget: 9,
        armorBreak: true,
        injuryTotal: 8,
      });

      expect(seedResult).not.toBeNull();

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const blockResults = testController.rollBlockDice(1);
      expect(fixtureValue(blockResults[0]).type).toBe("pow");

      const armorCheck = testController.rollArmorCheck({ av: 9 });
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

      const testRng = new RNGService(fixtureValue(seedResult).seed);
      const testController = new DiceController(new EventBus(), testRng);

      const blockResults = testController.rollBlockDice(1);
      expect(fixtureValue(blockResults[0]).type).toBe("pow");

      const armorCheck = testController.rollArmorCheck({ av: 8 });
      expect(armorCheck.broken).toBe(true);

      const injury = testController.rollInjury();
      expect(injury.total).toBeGreaterThanOrEqual(10);

      const casualtyRoll = testRng.rollDie(16);
      expect(casualtyRoll).toBe(15);
    });

    it("should produce consistent multi-roll sequences", () => {
      const seed = 777;

      const rng1 = new RNGService(seed);
      const controller1 = new DiceController(new EventBus(), rng1);

      const dodge1 = controller1.rollSkillCheck({ reason: "Dodge",target: 3,modifier: 0 });
      const block1 = controller1.rollBlockDice(2);
      const armor1 = controller1.rollArmorCheck({ av: 9 });
      const injury1 = controller1.rollInjury();

      const rng2 = new RNGService(seed);
      const controller2 = new DiceController(new EventBus(), rng2);

      const dodge2 = controller2.rollSkillCheck({ reason: "Dodge",target: 3,modifier: 0 });
      const block2 = controller2.rollBlockDice(2);
      const armor2 = controller2.rollArmorCheck({ av: 9 });
      const injury2 = controller2.rollInjury();

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
