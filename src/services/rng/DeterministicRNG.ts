export class DeterministicRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Generates a pseudo-random float in the range [0, 1).
   * USAGE: mulberry32 algorithm
   */
  public next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a pseudo-random integer between min and max (inclusive).
   */
  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Returns current internal seed state.
   */
  public getSeed(): number {
    return this.seed;
  }
}
