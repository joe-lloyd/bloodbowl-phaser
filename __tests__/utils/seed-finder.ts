import { RNGService } from "../../src/services/rng/RNGService";
import { DiceController } from "../../src/game/controllers/DiceController";
import { BlockResult } from "../../src/services/BlockResolutionService";
import { EventBus } from "../../src/services/EventBus";

/**
 * Options for finding a seed that produces a specific injury chain
 */
export interface InjuryChainOptions {
  numBlockDice?: number; // Number of block dice to roll (default: 1)
  blockResult?: BlockResult["type"];
  armorTarget?: number;
  armorBreak: boolean;
  injuryTotal?: number;
  casualtyRoll?: number;
}

/**
 * Named scenario for batch seed finding
 */
export interface SeedScenario {
  name: string;
  validator: (rng: RNGService, diceController: DiceController) => boolean;
}

/**
 * Result from seed finding operation
 */
export interface SeedResult {
  seed: number;
  attempts: number;
}

/**
 * Find a seed that produces an exact sequence of D6 rolls
 * @param sequence - Array of expected dice values
 * @param maxAttempts - Maximum attempts before giving up (default: 100,000)
 * @returns Seed number or null if not found
 */
export function findSeedForDiceSequence(
  sequence: number[],
  maxAttempts = 100000
): SeedResult | null {
  for (let seed = 1; seed <= maxAttempts; seed++) {
    const rng = new RNGService(seed);
    let matches = true;

    for (const expected of sequence) {
      const roll = rng.rollDie(6);
      if (roll !== expected) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return { seed, attempts: seed };
    }
  }

  return null;
}

/**
 * Find a seed that produces specific block dice results
 * @param outcome - Array of expected block results (e.g., ['POW', 'PUSH'])
 * @param maxAttempts - Maximum attempts before giving up
 * @returns Seed number or null if not found
 */
export function findSeedForBlockOutcome(
  outcome: BlockResult["type"][],
  maxAttempts = 100000
): SeedResult | null {
  const eventBus = new EventBus();

  for (let seed = 1; seed <= maxAttempts; seed++) {
    const rng = new RNGService(seed);
    const diceController = new DiceController(eventBus, rng);

    const results = diceController.rollBlockDice(outcome.length);
    const matches = results.every((r, i) => r.type === outcome[i]);

    if (matches) {
      return { seed, attempts: seed };
    }
  }

  return null;
}

/**
 * Find a seed that produces a specific injury chain sequence
 * This is useful for testing complex scenarios like player deaths
 *
 * @param options - Configuration for the injury chain
 * @param maxAttempts - Maximum attempts before giving up
 * @returns Seed number or null if not found
 *
 * @example
 * // Find seed for: Block POW → Armor 10+ break → Injury 10+ → Casualty 15 (death)
 * const result = findSeedForInjuryChain({
 *   blockResult: 'POW',
 *   armorTarget: 10,
 *   armorBreak: true,
 *   injuryTotal: 10,
 *   casualtyRoll: 15
 * });
 */
export function findSeedForInjuryChain(
  options: InjuryChainOptions,
  maxAttempts = 100000
): SeedResult | null {
  const eventBus = new EventBus();
  const numBlockDice = options.numBlockDice || 1;

  for (let seed = 1; seed <= maxAttempts; seed++) {
    const rng = new RNGService(seed);
    const diceController = new DiceController(eventBus, rng);

    let valid = true;

    // Step 1: Check block result if specified
    const blockResults = diceController.rollBlockDice(numBlockDice);

    if (options.blockResult) {
      // For single die, exact match
      if (numBlockDice === 1) {
        if (blockResults[0].type !== options.blockResult) {
          continue;
        }
      } else {
        // For multiple dice, need at least one matching result
        // (attacker will choose the best, which should include POW if available)
        const hasPow = blockResults.some(
          (r) => r.type === "pow" || r.type === "pow-dodge"
        );
        if (!hasPow) {
          continue;
        }
      }
    } else if (numBlockDice > 1) {
      // If no specific result required but using multiple dice,
      // at least make sure we have a POW for successful block
      const hasPow = blockResults.some(
        (r) => r.type === "pow" || r.type === "pow-dodge"
      );
      if (!hasPow) {
        continue;
      }
    }

    // Step 2: Check armor roll
    const armorTarget = options.armorTarget || 10;
    const armorCheck = diceController.rollArmorCheck(armorTarget);

    if (armorCheck.broken !== options.armorBreak) {
      continue;
    }

    // If armor not broken, no need to check injury
    if (!options.armorBreak) {
      return { seed, attempts: seed };
    }

    // Step 3: Check injury total if specified
    if (options.injuryTotal !== undefined) {
      const injuryResult = diceController.rollInjury();

      if (injuryResult.total < options.injuryTotal) {
        continue;
      }
    }

    // Step 4: Check casualty roll if specified (D16)
    if (options.casualtyRoll !== undefined) {
      const casualtyRoll = rng.rollDie(16);

      if (casualtyRoll !== options.casualtyRoll) {
        continue;
      }
    }

    if (valid) {
      return { seed, attempts: seed };
    }
  }

  return null;
}

/**
 * Find seeds for multiple scenarios in batch
 * Useful for pre-computing seeds for a test suite
 *
 * @param scenarios - Array of named scenarios to find seeds for
 * @param maxAttempts - Maximum attempts per scenario
 * @returns Map of scenario names to seed results
 *
 * @example
 * const scenarios = [
 *   {
 *     name: 'player-death',
 *     validator: (rng, dice) => {
 *       const block = dice.rollBlockDice(1);
 *       return block[0].type === 'POW';
 *     }
 *   }
 * ];
 * const seeds = findSeedsForMultipleOutcomes(scenarios);
 */
export function findSeedsForMultipleOutcomes(
  scenarios: SeedScenario[],
  maxAttempts = 100000
): Map<string, SeedResult> {
  const results = new Map<string, SeedResult>();
  const eventBus = new EventBus();

  for (const scenario of scenarios) {
    for (let seed = 1; seed <= maxAttempts; seed++) {
      const rng = new RNGService(seed);
      const diceController = new DiceController(eventBus, rng);

      if (scenario.validator(rng, diceController)) {
        results.set(scenario.name, { seed, attempts: seed });
        break;
      }
    }
  }

  return results;
}

/**
 * Export discovered seeds to JSON format for caching
 */
export function exportSeeds(seeds: Map<string, SeedResult>): string {
  const obj: Record<string, SeedResult> = {};
  seeds.forEach((result, name) => {
    obj[name] = result;
  });
  return JSON.stringify(obj, null, 2);
}

/**
 * Import seeds from JSON format
 */
export function importSeeds(json: string): Map<string, SeedResult> {
  const obj = JSON.parse(json) as Record<string, SeedResult>;
  const map = new Map<string, SeedResult>();
  Object.entries(obj).forEach(([name, result]) => {
    map.set(name, result);
  });
  return map;
}
