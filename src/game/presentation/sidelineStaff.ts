import { Team } from "../../types/Team";

export type SidelineStaffType = "coach" | "cheerleader" | "apothecary" | "fan";

export interface SidelineStaffMember {
  type: SidelineStaffType;
  index: number;
  label: string;
  color: number;
}

export const SIDELINE_STAFF_CAPS: Readonly<Record<SidelineStaffType, number>> =
  {
    coach: 3,
    cheerleader: 4,
    apothecary: 1,
    fan: 3,
  };

const STAFF_STYLE: Record<
  SidelineStaffType,
  Pick<SidelineStaffMember, "label" | "color">
> = {
  coach: { label: "C", color: 0xd6b25e },
  cheerleader: { label: "★", color: 0xc34d8b },
  apothecary: { label: "+", color: 0xe8ddc4 },
  fan: { label: "F", color: 0x8f7550 },
};

function members(
  type: SidelineStaffType,
  count: number
): SidelineStaffMember[] {
  const visibleCount = Math.min(Math.max(0, count), SIDELINE_STAFF_CAPS[type]);
  return Array.from({ length: visibleCount }, (_, index) => ({
    type,
    index,
    ...STAFF_STYLE[type],
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
