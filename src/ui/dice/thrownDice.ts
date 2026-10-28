/**
 * Which rolls are thrown as 3D dice: D6s in the dice tray and block dice in
 * the block dialog. A D3, D8 or D16 has no die model. The thrown dice make
 * their own sound as they land, so the sound suite skips its dice rattle
 * for these.
 */
export const isBlockDice = (diceType: string): boolean =>
  /block/i.test(diceType);

export const isD6 = (diceType: string): boolean => /^\d*d6$/i.test(diceType);

export const isThrownIn3D = (diceType: string): boolean =>
  isBlockDice(diceType) || isD6(diceType);
