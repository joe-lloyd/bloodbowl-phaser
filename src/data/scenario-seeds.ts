/**
 * Pre-computed RNG seeds for deterministic scenario outcomes.
 *
 * These seeds are discovered using the seed-finder utilities in __tests__/utils/seed-finder.ts
 * Each seed produces a specific sequence of dice rolls that result in the described outcome.
 *
 * Usage:
 * - Import the desired seed constant
 * - Add it to a scenario's `seed` field
 * - Optionally add `expectedOutcome` to describe what will happen
 *
 * To discover new seeds, use the seed-finder utilities:
 * ```typescript
 * import { findSeedForInjuryChain } from '__tests__/utils/seed-finder';
 *
 * const result = findSeedForInjuryChain({
 *   blockResult: 'pow',
 *   armorBreak: true,
 *   injuryTotal: 10,
 *   casualtyRoll: 15
 * });
 * console.log('Seed for death:', result.seed);
 * ```
 */

export const SCENARIO_SEEDS = {
  // =========================================================================
  // BLOCK OUTCOMES
  // =========================================================================

  /**
   * Single block die produces POW result
   * Useful for testing successful blocks without injury
   */
  BLOCK_POW: 3, // Produces POW on first block die

  /**
   * Two block dice both produce POW results
   * Best case scenario for attacker
   */
  BLOCK_DOUBLE_POW: 41, // Produces POW, POW on 2D block

  /**
   * Block die produces SKULL result (attacker down)
   * Causes turnover
   */
  BLOCK_SKULL: 1, // Produces SKULL on first block die

  /**
   * Block die produces BOTH DOWN result
   * Both players knocked down (turnover without Block skill)
   */
  BLOCK_BOTH_DOWN: 2, // Produces BOTH DOWN on first block die

  /**
   * Block die produces PUSH result
   * Defender pushed back without knockdown
   */
  BLOCK_PUSH: 5, // Produces PUSH on first block die

  // =========================================================================
  // INJURY CHAINS (Block → Armor → Injury → Casualty)
  // =========================================================================

  /**
   * Full sequence: POW → Armor breaks → Stunned (injury 2-7)
   * Player will be placed face-up on ground, removed next drive
   */
  PLAYER_STUNNED: 12745, // Block POW → Armor 9+ → Injury 7

  /**
   * Full sequence: POW → Armor breaks → KO (injury 8-9)
   * Player moved to KO box
   */
  PLAYER_KO: 1126, // Block POW → Armor 9+ → Injury 8

  /**
   * Full sequence: POW → Armor breaks → Casualty (injury 10-12)
   * Proceeds to casualty table
   */
  PLAYER_CASUALTY: 348, // Block POW → Armor 9+ → Injury 10

  /**
   * Full sequence: POW → Armor breaks → Injury 10+ → DEAD (casualty 15-16)
   * Player permanently removed from roster
   */
  PLAYER_DEATH: 16209, // Block POW → Armor 9+ → Injury 10+ → Casualty 15

  /**
   * Armor holds (low 2D6 roll)
   * No injury occurs
   */
  ARMOR_HOLD: 45, // 2D6 = 2 (snake eyes)

  /**
   * Armor breaks (high 2D6 roll)
   * Proceeds to injury roll
   */
  ARMOR_BREAK: 82, // 2D6 = 12 (boxcars)

  // =========================================================================
  // PASS OUTCOMES
  // =========================================================================

  /**
   * Pass succeeds, catch succeeds
   * Perfect completion
   */
  PASS_SUCCESS: 776, // Pass roll succeeds, catch succeeds

  /**
   * Pass fails (fumble)
   * Ball scatters from thrower
   */
  PASS_FUMBLE: 181, // Pass roll fails (natural 1 or below target)

  /**
   * Pass succeeds, catch fails (drop)
   * Ball scatters from receiver's square
   */
  PASS_DROP: 2401, // Pass succeeds, catch fails

  /**
   * Opponent successfully intercepts pass
   * Turnover and ball to opponent
   */
  PASS_INTERCEPTION: 5631, // Interception roll succeeds

  // =========================================================================
  // PICKUP OUTCOMES
  // =========================================================================

  /**
   * Pickup succeeds
   * Player picks up ball successfully
   */
  PICKUP_SUCCESS: 6, // AG roll succeeds

  /**
   * Pickup fails (fumble)
   * Ball scatters from pickup square
   */
  PICKUP_FUMBLE: 1, // AG roll fails

  // =========================================================================
  // DODGE OUTCOMES
  // =========================================================================

  /**
   * Dodge succeeds
   * Player successfully leaves tackle zone
   */
  DODGE_SUCCESS: 6, // AG roll succeeds

  /**
   * Dodge fails
   * Player falls and may be injured
   */
  DODGE_FAIL: 451, // AG roll fails

  // =========================================================================
  // SKILL CHECK OUTCOMES
  // =========================================================================

  /**
   * Natural 6 (always succeeds)
   */
  NATURAL_6: 6, // First roll is 6

  /**
   * Natural 1 (always fails)
   */
  NATURAL_1: 1, // First roll is 1

  // =========================================================================
  // COMBINED SCENARIOS
  // =========================================================================

  /**
   * Multiple failures in sequence
   * Useful for testing "worst case" scenarios
   */
  MULTIPLE_FAILURES: 1111, // Multiple 1s and low rolls

  /**
   * Multiple successes in sequence
   * Useful for testing "best case" scenarios
   */
  MULTIPLE_SUCCESSES: 6666, // Multiple 6s and high rolls
} as const;

/**
 * Type helper for seed constant names
 */
export type ScenarioSeedName = keyof typeof SCENARIO_SEEDS;

/**
 * Get a seed value by name
 */
export function getSeed(name: ScenarioSeedName): number {
  return SCENARIO_SEEDS[name];
}

/**
 * Get all available seed names
 */
export function getAllSeedNames(): ScenarioSeedName[] {
  return Object.keys(SCENARIO_SEEDS) as ScenarioSeedName[];
}
