import type { ReactNode } from "react";
import type { FixtureOptions, MatchFixture } from "./fixtures";

export const GROUPS = [
  "Building blocks",
  "Pre-match",
  "Kick-off",
  "Setup",
  "In play",
  "Dice",
  "Half-time and post-match",
  "Team pages",
  "Competitions",
  "Online",
] as const;

export type Group = (typeof GROUPS)[number];

type Cleanup = () => void;

export interface Variant {
  id: string;
  group: Group;
  section: string;
  title: string;
  stage?: "pitch" | "page" | "sheet";
  fixture?: FixtureOptions;
  prepare?: () => void;
  view: (fx: MatchFixture) => ReactNode;
  drive?: (fx: MatchFixture) => Cleanup | undefined;
}

export type Drive = NonNullable<Variant["drive"]>;

export type Row = Pick<Variant, "id" | "title"> &
  Partial<Pick<Variant, "fixture" | "drive" | "view" | "prepare">>;

export const rows = (
  shared: Omit<Variant, "id" | "title">,
  list: readonly Row[]
): Variant[] => list.map((row) => ({ ...shared, ...row }));
