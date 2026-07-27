import { Team } from "../../types/Team";

export type SidelineStaffType = "coach" | "cheerleader" | "apothecary" | "fan";

export interface SidelineStaffMember {
  type: SidelineStaffType;
  index: number;
  label: string;
  color: number;
  /** Display name for the info panel, e.g. "Assistant Coach". */
  name: string;
  /** Plain-English statement of what this staff type does in match terms. */
  effect: string;
}

export const SIDELINE_STAFF_CAPS: Readonly<Record<SidelineStaffType, number>> =
  {
    coach: 3,
    cheerleader: 4,
    apothecary: 1,
    fan: 3,
  };

/**
 * Style, display copy and the team's true count for each staff type. The
 * true-count function ignores the rail's drawn cap so the info panel can
 * report a team's real total (see `getSidelineCrewInfo`).
 */
const STAFF_INFO: Record<
  SidelineStaffType,
  Pick<SidelineStaffMember, "label" | "color" | "name" | "effect"> & {
    countOf: (team: Team) => number;
  }
> = {
  coach: {
    label: "C",
    color: 0xd6b25e,
    name: "Assistant Coach",
    effect: "Adds to your team's Brilliant Coaching roll on the kickoff table.",
    countOf: (team) => team.coaches ?? 0,
  },
  cheerleader: {
    label: "★",
    color: 0xc34d8b,
    name: "Cheerleader",
    effect: "Adds to your team's Cheering Fans roll on the kickoff table.",
    countOf: (team) => team.cheerleaders ?? 0,
  },
  apothecary: {
    label: "+",
    color: 0xe8ddc4,
    name: "Apothecary",
    effect: "May patch up one Knocked Out or injured player, once per match.",
    countOf: (team) => (team.apothecary ? 1 : 0),
  },
  fan: {
    label: "F",
    color: 0x8f7550,
    name: "Dedicated Fan",
    effect:
      "Adds to your team's Pitch Invasion roll on the kickoff table, and to your matchday winnings.",
    countOf: (team) => team.dedicatedFans ?? 0,
  },
};

/**
 * The panel subject for a sideline crew figure (or the empty-rail
 * placeholder). Shared by both the Phaser figure hover and the React
 * `NO STAFF` label hover so the two renderers cannot present different text.
 */
export interface SidelineCrewInfo {
  /** Null for the empty-rail case, which is not tied to one staff type. */
  type: SidelineStaffType | null;
  name: string;
  effect: string;
  /** The team's real count of this staff type (0 for the empty-rail case). */
  count: number;
}

function members(
  type: SidelineStaffType,
  count: number
): SidelineStaffMember[] {
  const visibleCount = Math.min(Math.max(0, count), SIDELINE_STAFF_CAPS[type]);
  const { label, color, name, effect } = STAFF_INFO[type];
  return Array.from({ length: visibleCount }, (_, index) => ({
    type,
    index,
    label,
    color,
    name,
    effect,
  }));
}

/**
 * Pure staff projection used by the renderer and tests. Counts are capped so
 * the dedicated 180×150 rail can never spill into player interaction slots.
 */
export function getVisibleSidelineStaff(team: Team): SidelineStaffMember[] {
  return [
    ...members("coach", team.coaches ?? 0),
    ...members("cheerleader", team.cheerleaders ?? 0),
    ...members("apothecary", team.apothecary ? 1 : 0),
    ...members("fan", team.dedicatedFans ?? 0),
  ];
}

/**
 * Builds the info-panel subject for a specific staff type, reporting the
 * team's real count rather than the number of figures the rail drew. Shared
 * by the Phaser crew-figure hover and the React `NO STAFF` label hover.
 */
export function getSidelineCrewInfo(
  type: SidelineStaffType,
  team: Team
): SidelineCrewInfo {
  const info = STAFF_INFO[type];
  return {
    type,
    name: info.name,
    effect: info.effect,
    count: info.countOf(team),
  };
}

/**
 * The info-panel subject for the `NO STAFF` placeholder: the team retains no
 * sideline staff of any type, so there is nothing to attribute to a single
 * type or count.
 */
export function getEmptySidelineCrewInfo(): SidelineCrewInfo {
  return {
    type: null,
    name: "No Sideline Crew",
    effect:
      "This team retains no sideline staff, so it gets no bonus on the Brilliant Coaching, Cheering Fans, or Pitch Invasion kickoff rolls, and has no Apothecary to patch up an injured player.",
    count: 0,
  };
}
