/** A test uses a natural D6, or the sum of two armour dice. */
export type ProbabilityRoll = {
  dice: "d6" | "2d6";
  target: number;
  reroll?: boolean;
};

/** Exact independent success chance. Route chances exclude optional re-rolls. */
export function rollProbability(rolls: readonly ProbabilityRoll[]): number {
  return rolls.reduce((chance, roll) => {
    let successes = 0;
    let outcomes = 0;
    switch (roll.dice) {
      case "d6":
        for (let die = 1; die <= 6; die++) {
          outcomes++;
          if (die === 6 || (die !== 1 && die >= roll.target)) successes++;
        }
        break;
      case "2d6":
        for (let a = 1; a <= 6; a++) {
          for (let b = 1; b <= 6; b++) {
            outcomes++;
            if (a + b >= roll.target) successes++;
          }
        }
        break;
    }
    const p = successes / outcomes;
    return chance * (roll.reroll ? p + (1 - p) * p : p);
  }, 1);
}

export function rollLabel(
  name: string,
  target: number,
  dice: ProbabilityRoll["dice"] = "d6"
): string {
  const percent = Math.round(100 * rollProbability([{ dice, target }]));
  return `${name}: ${target}+ (${percent}%)`;
}

/** Natural 1 fails and natural 6 passes an ability test. */
export const requiredRoll = (target: number, modifier = 0): number =>
  Math.min(6, Math.max(2, target - modifier));

