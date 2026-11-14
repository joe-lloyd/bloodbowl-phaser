/**
 * Which rolls are thrown as 3D dice: D6s, D16s and block dice in the tray.
 * A D3 or D8 has no die model. The thrown dice make
 * their own sound as they land, so the sound suite skips its dice rattle
 * for these.
 */
export const isBlockDice = (diceType: string): boolean =>
  /block/i.test(diceType);

export const isD6 = (diceType: string): boolean => /^\d*d6$/i.test(diceType);
export const isD16 = (diceType: string): boolean => /^\d*d16$/i.test(diceType);

export const isThrownIn3D = (diceType: string): boolean =>
  isBlockDice(diceType) || isD6(diceType) || isD16(diceType);
