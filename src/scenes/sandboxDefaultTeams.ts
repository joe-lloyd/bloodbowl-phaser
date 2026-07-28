import { RosterName } from "../types/Team";

/**
 * Default sandbox matchup used when SandboxScene starts with no teams
 * passed in and no scenario loaded yet. Two different rosters — Human vs.
 * Orc (not Black Orc) — so the sides are visually distinguishable by team
 * color and roster at a glance, and the default is never a mirror-match.
 * See openspec/specs/sandbox-rule-explorer.
 */
export const SANDBOX_DEFAULT_TEAM1_ROSTER = RosterName.HUMAN;
export const SANDBOX_DEFAULT_TEAM2_ROSTER = RosterName.ORC;
