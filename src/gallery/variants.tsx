import { AFTER_VARIANTS } from "./afterVariants";
import { BLOCK_VARIANTS } from "./blockVariants";
import { DIALOG_VARIANTS } from "./dialogVariants";
import { DICE_VARIANTS } from "./diceVariants";
import { KICKOFF_VARIANTS } from "./kickoffVariants";
import { ONLINE_VARIANTS } from "./onlineVariants";
import { PAGE_VARIANTS } from "./pageVariants";
import { PLAY_VARIANTS } from "./playVariants";
import { PRE_MATCH_VARIANTS } from "./preMatchVariants";
import { SETUP_VARIANTS } from "./setupVariants";
import type { Variant } from "./variant";

export const VARIANTS: Variant[] = [
  ...BLOCK_VARIANTS,
  ...PAGE_VARIANTS,
  ...PRE_MATCH_VARIANTS,
  ...KICKOFF_VARIANTS,
  ...SETUP_VARIANTS,
  ...PLAY_VARIANTS,
  ...DIALOG_VARIANTS,
  ...DICE_VARIANTS,
  ...AFTER_VARIANTS,
  ...ONLINE_VARIANTS,
];
