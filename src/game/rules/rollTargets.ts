/**
 * What a roll needs. A coach sees the target and nothing more, as the
 * rules give it: "Dodge: 3+", never its odds.
 */

/** Natural 1 fails and natural 6 passes an ability test. */
export const requiredRoll = (target: number, modifier = 0): number =>
  Math.min(6, Math.max(2, target - modifier));

/** "Dodge: 3+". */
export const rollLabel = (name: string, target: number): string =>
  `${name}: ${target}+`;
