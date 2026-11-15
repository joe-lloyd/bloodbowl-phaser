/**
 * Every gallery variant: which fixture it needs, what it renders, and the
 * events it plays into the real components once they are mounted.
 */
import React from "react";
import type { FixtureOptions, MatchFixture } from "./fixtures";
import { HUD_VARIANTS } from "./hudVariants";
import { SETUP_VARIANTS } from "./setupVariants";
import { PLAYER_VARIANTS } from "./playerVariants";
import { DICE_VARIANTS } from "./diceVariants";
import { DIALOG_VARIANTS } from "./dialogVariants";
import { MATCH_FLOW_VARIANTS } from "./matchFlowVariants";
import { ONLINE_VARIANTS } from "./onlineVariants";
import { SCREEN_VARIANTS } from "./screenVariants";
import { PAGE_VARIANTS } from "./pageVariants";

export interface Variant {
  id: string;
  section: string;
  title: string;
  /** Stage height in px (the stage is always 1280 wide). */
  height?: number;
  /** "page" drops the pitch backdrop, for the pages around the match. */
  stage?: "pitch" | "page";
  fixture?: FixtureOptions;
  /** Runs before the first render, e.g. to seed localStorage. */
  prepare?: () => void;
  view: (fx: MatchFixture) => React.ReactNode;
  /** Plays events into the mounted components. May return a cleanup. */
  drive?: (fx: MatchFixture) => void | (() => void);
}

export const VARIANTS: Variant[] = [
  ...HUD_VARIANTS,
  ...SETUP_VARIANTS,
  ...PLAYER_VARIANTS,
  ...DICE_VARIANTS,
  ...DIALOG_VARIANTS,
  ...MATCH_FLOW_VARIANTS,
  ...ONLINE_VARIANTS,
  ...SCREEN_VARIANTS,
  ...PAGE_VARIANTS,
];

export const SECTIONS = [...new Set(VARIANTS.map((v) => v.section))];
