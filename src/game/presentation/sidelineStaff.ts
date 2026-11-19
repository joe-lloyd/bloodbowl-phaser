import { type Team } from "../../types/Team";

export type SidelineStaffType = "coach" | "cheerleader" | "apothecary" | "fan";

export interface SidelineStaffMember {
  type: SidelineStaffType;
  index: number;
  label: string;
  color: number;

  name: string;

  effect: string;
}

export const SIDELINE_STAFF_CAPS: Readonly<Record<SidelineStaffType, number>> =
  {
    coach: 3,
    cheerleader: 4,
    apothecary: 1,
    fan: 3,
  };

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

export interface SidelineCrewInfo {
  type: SidelineStaffType | null;
  name: string;
  effect: string;

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

export function getVisibleSidelineStaff(team: Team): SidelineStaffMember[] {
  return [
    ...members("coach", team.coaches ?? 0),
    ...members("cheerleader", team.cheerleaders ?? 0),
    ...members("apothecary", team.apothecary ? 1 : 0),
    ...members("fan", team.dedicatedFans ?? 0),
  ];
}

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

export function getEmptySidelineCrewInfo(): SidelineCrewInfo {
  return {
    type: null,
    name: "No Sideline Crew",
    effect:
      "This team retains no sideline staff, so it gets no bonus on the Brilliant Coaching, Cheering Fans, or Pitch Invasion kickoff rolls, and has no Apothecary to patch up an injured player.",
    count: 0,
  };
}
