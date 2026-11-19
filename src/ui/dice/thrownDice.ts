export const isBlockDice = (diceType: string): boolean =>
  /block/i.test(diceType);

export const isD6 = (diceType: string): boolean => /^\d*d6$/i.test(diceType);
export const isD16 = (diceType: string): boolean => /^\d*d16$/i.test(diceType);

export const isThrownIn3D = (diceType: string): boolean =>
  isBlockDice(diceType) || isD6(diceType) || isD16(diceType);
