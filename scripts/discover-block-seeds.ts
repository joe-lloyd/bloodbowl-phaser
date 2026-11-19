import { findSeedForInjuryChain } from "../__tests__/utils/seed-finder.js";

console.log("🔍 Discovering seeds for 2D block scenarios...\n");

console.log("Finding seed for: Block → Stun");
console.log(
  "Expected: 2D block with at least one POW/POW-DODGE, armor breaks, injury 2-7"
);

const stunSeed = findSeedForInjuryChain(
  {
    numBlockDice: 2,

    armorTarget: 9,
    armorBreak: true,
    injuryTotal: 2,
  },
  500000
);

if (stunSeed) {
  console.log(
    `✅ Found seed for STUN: ${String(stunSeed.seed)} (found in ${String(stunSeed.attempts)} attempts)\n`
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
    injuryTotal: 8,
  },
  500000
);

if (koSeed) {
  console.log(
    `✅ Found seed for KO: ${String(koSeed.seed)} (found in ${String(koSeed.attempts)} attempts)\n`
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
    injuryTotal: 10,
  },
  500000
);

if (casualtySeed) {
  console.log(
    `✅ Found seed for CASUALTY: ${String(casualtySeed.seed)} (found in ${String(casualtySeed.attempts)} attempts)\n`
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
    casualtyRoll: 15,
  },
  500000
);

if (deathSeed) {
  console.log(
    `✅ Found seed for DEATH: ${String(deathSeed.seed)} (found in ${String(deathSeed.attempts)} attempts)\n`
  );
} else {
  console.log("❌ Could not find seed for DEATH\n");
}

console.log("\n📋 Summary - Update scenarios.ts with these seeds:");
console.log("=".repeat(60));
if (stunSeed) console.log(`Block → Stun:      seed: ${String(stunSeed.seed)}`);
if (koSeed) console.log(`Block → KO:        seed: ${String(koSeed.seed)}`);
if (casualtySeed)
  console.log(`Block → Casualty:  seed: ${String(casualtySeed.seed)}`);
if (deathSeed)
  console.log(`Block → Death:     seed: ${String(deathSeed.seed)}`);
console.log("=".repeat(60));
