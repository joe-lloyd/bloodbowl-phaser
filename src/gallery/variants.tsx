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

  height?: number;

  stage?: "pitch" | "page";
  fixture?: FixtureOptions;

  prepare?: () => void;
  view: (fx: MatchFixture) => React.ReactNode;

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
