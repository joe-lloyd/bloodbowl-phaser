export class DeterministicRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  public next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  public getSeed(): number {
    return this.seed;
  }

  public setSeed(seed: number): void {
    if (!Number.isFinite(seed)) {
      throw new TypeError("rng-state-must-be-a-finite-number");
    }
    this.seed = seed;
  }
}
