import { describe, expect, it } from "vitest";
import { gridPointToPixel } from "../../src/game/elements/GridUtils";
import {
  pitchExitRoute,
  carrierProjection,
  walkingSteps,
  worldToBoard,
} from "../../src/game/presentation/sidelineRoutes";

const project = (x: number, y: number) => {
  const point = gridPointToPixel(x, y);
  return { x: point.x + 1351, y: point.y + 1115 };
};

describe("sideline exit routes", () => {
  it.each([
    {
      to: { x: 100, y: 50 },
      along: { x: 40, y: 20 },
      across: { x: -40, y: 20 },
    },
    {
      to: { x: 100, y: -50 },
      along: { x: 40, y: -20 },
      across: { x: 40, y: 20 },
    },
    {
      to: { x: -100, y: -50 },
      along: { x: 40, y: 20 },
      across: { x: -40, y: 20 },
    },
    {
      to: { x: -100, y: 50 },
      along: { x: 40, y: -20 },
      across: { x: 40, y: 20 },
    },
  ])(
    "projects a carrier along either board axis towards $to",
    ({ to, along, across }) => {
      const point = carrierProjection({ x: 0, y: 0 }, to);
      const length = 40 * Math.SQRT2;
      expect(point(length, 0).x).toBeCloseTo(along.x);
      expect(point(length, 0).y).toBeCloseTo(along.y);
      expect(point(0, length).x).toBeCloseTo(across.x);
      expect(point(0, length).y).toBeCloseTo(across.y);
    }
  );

  it.each([
    { patient: [15.5, 8.5], box: [0.5, -1.5], lane: -0.5 },
    { patient: [2.5, 1.5], box: [20.5, 12.5], lane: 11.5 },
  ])(
    "leaves through the team's touchline before following it to $box",
    ({ patient, box, lane }) => {
      const route = pitchExitRoute(
        project(patient[0], patient[1]),
        project(box[0], box[1]),
        11,
        project
      );
      const grid = route.map((point) => worldToBoard(point, project));
      const expected = [patient, [patient[0], lane], [box[0], lane], box];
      grid.forEach((point, i) => {
        expect(point.x).toBeCloseTo(expected[i][0]);
        expect(point.y).toBeCloseTo(expected[i][1]);
      });
    }
  );

  it("keeps a fractional patient position instead of rounding it to a square", () => {
    const patient = project(4.25, 7.75);
    const route = pitchExitRoute(patient, project(1.5, -2.5), 11, project);
    expect(route[1].x).toBeCloseTo(project(4.25, -0.5).x);
    expect(route[1].y).toBeCloseTo(project(4.25, -0.5).y);
  });

  it("preserves corners when splitting a walking route into animation steps", () => {
    const route = pitchExitRoute(
      project(12.5, 6.5),
      project(-0.5, -3.5),
      11,
      project
    );
    const steps = walkingSteps(route);
    route.slice(1).forEach((corner) => expect(steps).toContainEqual(corner));
    const withStart = [route[0], ...steps];
    for (let i = 1; i < withStart.length; i++) {
      const a = worldToBoard(withStart[i - 1], project);
      const b = worldToBoard(withStart[i], project);
      expect(Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThan(
        1e-8
      );
    }
  });

  it("handles a crowd injury and already aligned points without zero-length legs", () => {
    const from = project(-0.5, 11.5);
    const to = project(20.5, 12.5);
    const route = pitchExitRoute(from, to, 11, project);
    expect(route).toEqual([from, project(20.5, 11.5), to]);
  });
});
