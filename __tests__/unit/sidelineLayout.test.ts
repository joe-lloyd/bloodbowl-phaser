import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import meta from "../../public/stadium/bloodbowl/meta.json";
import {
  staffTerraceCorners,
  staffTerraceLayout,
  staffTerraceSlot,
} from "../../src/game/presentation/sidelineLayout";
import { getVisibleSidelineStaff } from "../../src/game/presentation/sidelineStaff";
import type { Team } from "../../src/types/Team";
import type { DugoutSquares } from "../../src/game/elements/Stadium";

describe("staff terrace space", () => {
  it.each(["home", "away"] as const)(
    "fits every capped staff figure beside the %s player boxes and behind the exit lane",
    (side) => {
      const boxes = meta.dugouts[side] as DugoutSquares;
      const layout = staffTerraceLayout(boxes);
      const staff = getVisibleSidelineStaff({
        coaches: 10,
        cheerleaders: 10,
        apothecary: true,
        dedicatedFans: 10,
      } as Team);
      const slots = staff.map((member) => staffTerraceSlot(layout, member));
      const playerXs = Object.values(boxes)
        .flat()
        .map(([x]) => x);
      expect(slots).toHaveLength(11);
      for (const slot of slots) {
        expect(slot.x).toBeGreaterThan(layout.x);
        expect(slot.x).toBeLessThan(layout.x + layout.width);
        expect((slot.y - layout.y) * layout.direction).toBeGreaterThan(0);
        expect((slot.y - layout.y) * layout.direction).toBeLessThan(
          layout.depth
        );
        if (side === "home") {
          expect(slot.x).toBeGreaterThan(Math.max(...playerXs) + 0.5);
          expect(slot.y).toBeLessThan(-1);
        } else {
          expect(slot.x).toBeLessThan(Math.min(...playerXs) - 0.5);
          expect(slot.y).toBeGreaterThan(meta.rows + 1);
        }
      }
      for (let i = 0; i < slots.length; i++) {
        for (const other of slots.slice(i + 1)) {
          expect(
            Math.hypot(fixtureValue(slots[i]).x - other.x, fixtureValue(slots[i]).y - other.y)
          ).toBeGreaterThan(0.8);
        }
      }
      expect(staffTerraceCorners(layout)).toHaveLength(4);
    }
  );
});
