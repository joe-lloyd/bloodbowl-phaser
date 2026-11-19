import { fixtureValue } from "../../src/testing/fixtureValue";
import { RNGService } from "../../src/services/rng/RNGService";
import { DiceController } from "../../src/game/controllers/DiceController";
import { type BlockResult } from "../../src/services/BlockResolutionService";
import { EventBus } from "../../src/services/EventBus";

export interface InjuryChainOptions {
  numBlockDice?: number;
  blockResult?: BlockResult["type"];
  armorTarget?: number;
  armorBreak: boolean;
  injuryTotal?: number;
  casualtyRoll?: number;
}

export interface SeedResult {
  seed: number;
  attempts: number;
}

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

export function findSeedForInjuryChain(
  options: InjuryChainOptions,
  maxAttempts = 100000
): SeedResult | null {
  const eventBus = new EventBus();
  const numBlockDice = options.numBlockDice || 1;

  for (let seed = 1; seed <= maxAttempts; seed++) {
    const rng = new RNGService(seed);
    const diceController = new DiceController(eventBus, rng);
    if (injuryChainMatches(rng, diceController, options, numBlockDice)) {
      return { seed, attempts: seed };
    }
  }

  return null;
}

const isPow = (r: BlockResult) => r.type === "pow" || r.type === "pow-dodge";

function blockMatches(
  blockResults: BlockResult[],
  options: InjuryChainOptions,
  numBlockDice: number
): boolean {
  if (numBlockDice === 1) {
    return !options.blockResult || fixtureValue(blockResults[0]).type === options.blockResult;
  }

  return blockResults.some(isPow);
}

function injuryChainMatches(
  rng: RNGService,
  diceController: DiceController,
  options: InjuryChainOptions,
  numBlockDice: number
): boolean {
  const blockResults = diceController.rollBlockDice(numBlockDice);
  if (!blockMatches(blockResults, options, numBlockDice)) return false;

  const armorCheck = diceController.rollArmorCheck({ av: options.armorTarget||10 });
  if (armorCheck.broken !== options.armorBreak) return false;

  if (!options.armorBreak) return true;

  if (
    options.injuryTotal !== undefined &&
    diceController.rollInjury().total < options.injuryTotal
  ) {
    return false;
  }

  return (
    options.casualtyRoll === undefined ||
    rng.rollDie(16) === options.casualtyRoll
  );
}
