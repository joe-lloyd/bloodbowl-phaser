import { DeterministicRNG } from "./DeterministicRNG";

export interface IRNGService {
  rollDie(sides: number): number;
  rollMultipleDice(count: number, sides: number): number[];
  getSeed(): number;
}

export class RNGService implements IRNGService {
  private rng: DeterministicRNG;

  constructor(seed: number) {
    this.rng = new DeterministicRNG(seed);
  }

  public rollDie(sides: number): number {
    return this.rollMultipleDice(1, sides)[0];
  }

  public rollMultipleDice(count: number, sides: number): number[] {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      values.push(this.rng.nextInt(1, sides));
    }
    return values;
  }

  public getSeed(): number {
    return this.rng.getSeed();
  }
}
