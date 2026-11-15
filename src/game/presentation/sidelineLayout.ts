import type { DugoutSquares } from "../elements/Stadium";
import type { SidelineStaffMember } from "./sidelineStaff";
import type { BoardPoint } from "./sidelineRoutes";

/** A six-square extension beside the reserve box; the exit lane stays clear. */
export interface StaffTerraceLayout {
  x: number;
  y: number;
  width: number;
  depth: number;
  direction: 1 | -1;
}

export function staffTerraceLayout(squares: DugoutSquares): StaffTerraceLayout {
  const slots = Object.values(squares).flat();
  const home = slots[0][1] < 0;
  const xs = slots.map(([x]) => x);
  return {
    x: home ? Math.max(...xs) + 0.85 : Math.min(...xs) - 6.85,
    y: home
      ? Math.max(...slots.map(([, y]) => y)) + 0.45
      : Math.min(...slots.map(([, y]) => y)) - 0.45,
    width: 6,
    depth: 2.9,
    direction: home ? -1 : 1,
  };
}

/** Cheerleaders at the front, fans in the middle, seated staff at the back. */
export function staffTerraceSlot(
  layout: StaffTerraceLayout,
  member: Pick<SidelineStaffMember, "type" | "index">
): BoardPoint {
  const positions = {
    cheerleader: { x: 1.2 + member.index * 1.2, y: 0.55 },
    fan: { x: 1.5 + member.index * 1.5, y: 1.55 },
    coach: { x: 0.9 + member.index * 1.2, y: 2.45 },
    apothecary: { x: 4.9, y: 2.45 },
  };
  const slot = positions[member.type];
  return { x: layout.x + slot.x, y: layout.y + slot.y * layout.direction };
}

export function staffTerraceCorners(layout: StaffTerraceLayout): BoardPoint[] {
  return [
    { x: layout.x, y: layout.y },
    { x: layout.x + layout.width, y: layout.y },
    {
      x: layout.x + layout.width,
      y: layout.y + layout.depth * layout.direction,
    },
    { x: layout.x, y: layout.y + layout.depth * layout.direction },
  ];
}
