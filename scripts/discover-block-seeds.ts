/**
 * Script to discover correct seeds for block injury scenarios
 * Run with: npx ts-node scripts/discover-block-seeds.ts
 */

import {
  findSeedForInjuryChain,
  findSeedForBlockOutcome,
} from "../__tests__/utils/seed-finder.js";

console.log("🔍 Discovering seeds for 2D block scenarios...\n");

// For injury scenarios, we need:
// 1. Block with 2 dice (Orc blocks weaker player)
// 2. At least one POW result (attacker chooses best)
// 3. Specific armor and injury outcomes

console.log("Finding seed for: Block → Stun");
console.log(
  "Expected: 2D block with at least one POW/POW-DODGE, armor breaks, injury 2-7"
);

const stunSeed = findSeedForInjuryChain(
  {
    numBlockDice: 2, // 2 block dice for Orc vs weaker player
    // Don't specify blockResult - we're rolling 2 dice and need at least one POW
    armorTarget: 9,
    armorBreak: true,
    injuryTotal: 2, // Min for stun
  },
  500000
); // More attempts since this is complex

if (stunSeed) {
  console.log(
    `✅ Found seed for STUN: ${stunSeed.seed} (found in ${stunSeed.attempts} attempts)\n`
  );
} else {
  console.log("❌ Could not find seed for STUN\n");
}

console.log("Finding seed for: Block → KO");
console.log("Expected: 2D block with POW, armor breaks, injury 8-9");

const koSeed = findSeedForInjuryChain(
  {
    numBlockDice: 2,
    armorTarget: 9,
    armorBreak: true,
    injuryTotal: 8, // KO range
  },
  500000
);

if (koSeed) {
  console.log(
    `✅ Found seed for KO: ${koSeed.seed} (found in ${koSeed.attempts} attempts)\n`
  );
} else {
  console.log("❌ Could not find seed for KO\n");
}

console.log("Finding seed for: Block → Casualty");
console.log("Expected: 2D block with POW, armor breaks, injury 10-12");

const casualtySeed = findSeedForInjuryChain(
  {
    numBlockDice: 2,
    armorTarget: 9,
    armorBreak: true,
    injuryTotal: 10, // Casualty range
  },
  500000
);

if (casualtySeed) {
  console.log(
    `✅ Found seed for CASUALTY: ${casualtySeed.seed} (found in ${casualtySeed.attempts} attempts)\n`
  );
} else {
  console.log("❌ Could not find seed for CASUALTY\n");
}

console.log("Finding seed for: Block → Death");
console.log(
  "Expected: 2D block with POW, armor breaks, injury 10+, casualty 15-16"
);

const deathSeed = findSeedForInjuryChain(
  {
    numBlockDice: 2,
    armorTarget: 9,
    armorBreak: true,
    injuryTotal: 10,
    casualtyRoll: 15, // Death!
  },
  500000
);

if (deathSeed) {
  console.log(
    `✅ Found seed for DEATH: ${deathSeed.seed} (found in ${deathSeed.attempts} attempts)\n`
  );
} else {
  console.log("❌ Could not find seed for DEATH\n");
}

console.log("\n📋 Summary - Update scenarios.ts with these seeds:");
console.log("=".repeat(60));
if (stunSeed) console.log(`Block → Stun:      seed: ${stunSeed.seed}`);
if (koSeed) console.log(`Block → KO:        seed: ${koSeed.seed}`);
if (casualtySeed) console.log(`Block → Casualty:  seed: ${casualtySeed.seed}`);
if (deathSeed) console.log(`Block → Death:     seed: ${deathSeed.seed}`);
console.log("=".repeat(60));
