import { RosterName } from "../types/Team";

export const SANDBOX_DEFAULT_TEAM1_ROSTER = RosterName.HUMAN;
export const SANDBOX_DEFAULT_TEAM2_ROSTER = RosterName.ORC;

export const ARENA_SCENARIO_ID = "deathbowl-arena";

export const ARENA_TEAMS = [
  { roster: RosterName.HUMAN, name: "Arena Humans", colour: 0x4169e1 },
  { roster: RosterName.ORC, name: "Arena Orcs", colour: 0xdc143c },
  { roster: RosterName.SKAVEN, name: "Arena Skaven", colour: 0x2e8b57 },
  { roster: RosterName.DWARF, name: "Arena Dwarfs", colour: 0xdaa520 },
] as const;
