import { DeterministicRNG } from "./DeterministicRNG";

export interface RNGState {
  version: 1;
  initialSeed: number;
  currentSeed: number;
}

export interface IRNGService {
  rollDie(sides: number): number;
  rollMultipleDice(count: number, sides: number): number[];
  /** Current internal RNG state (advances with every roll) */
  getSeed(): number;
  /** The seed the game was started with — replaying it reproduces the game */
  getInitialSeed(): number;
  captureState(): RNGState;
  restoreState(state: RNGState): void;
}

export class RNGService implements IRNGService {
  private rng: DeterministicRNG;

  constructor(private initialSeed: number) {
    this.rng = new DeterministicRNG(initialSeed);
  }

  public getInitialSeed(): number {
    return this.initialSeed;
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

  public captureState(): RNGState {
    return {
      version: 1,
      initialSeed: this.initialSeed,
      currentSeed: this.rng.getSeed(),
    };
  }

  public restoreState(state: RNGState): void {
    if (
      state.version !== 1 ||
      !Number.isFinite(state.initialSeed) ||
      !Number.isFinite(state.currentSeed)
    ) {
      throw new Error("unsupported-or-invalid-rng-state");
    }
    this.initialSeed = state.initialSeed;
    this.rng.setSeed(state.currentSeed);
  }
}
