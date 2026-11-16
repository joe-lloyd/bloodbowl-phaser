import { gridToPixel } from "../../src/game/elements/GridUtils";

export type Team = "home" | "away";
export type Policy = "team" | "keep" | "overview";
export type Point = { x: number; y: number };
export type Player = Point & {
  id: string;
  number: number;
  team: Team;
  spent: boolean;
};
export type Camera = Point & { zoom: number };
export type Area = { left: number; top: number; right: number; bottom: number };

export const policies: { id: Policy; title: string; copy: string }[] = [
  {
    id: "team",
    title: "A · Team reset",
    copy: "End activation can change zoom to fit eligible teammates. End turn shows everyone, then frames the other team.",
  },
  {
    id: "keep",
    title: "B · Keep zoom",
    copy: "End activation pans to teammates at the current zoom. Only opening and turn handoff change zoom.",
  },
  {
    id: "overview",
    title: "C · Fixed overview",
    copy: "Opening settles into a pitch overview. Team handoffs and activation resets only pan, with no automatic zoom after opening.",
  },
];

type Scenario = {
  id: string;
  title: string;
  copy: string;
  home: Point[];
  away: Point[];
  tray: boolean;
};
const points = (pairs: [number, number][]): Point[] =>
  pairs.map(([x, y]) => ({ x, y }));
const midfieldHome = points([
  [8, 5],
  [6, 3],
  [7, 7],
  [4, 5],
  [6, 5],
  [8, 2],
  [5, 8],
]);
const midfieldAway = points([
  [11, 5],
  [12, 3],
  [11, 7],
  [14, 5],
  [13, 8],
  [15, 3],
  [16, 6],
]);
export const scenarios: Scenario[] = [
  {
    id: "midfield",
    title: "Midfield",
    copy: "A compact team near halfway. Select another player, move, then end activation.",
    home: midfieldHome,
    away: midfieldAway,
    tray: false,
  },
  {
    id: "far-touchline",
    title: "Far touchline",
    copy: "The carrier is one square from the far sideline. Check headroom below the score bug.",
    home: points([
      [10, 0],
      [8, 1],
      [7, 2],
      [5, 2],
      [6, 4],
      [9, 3],
      [4, 1],
    ]),
    away: midfieldAway,
    tray: false,
  },
  {
    id: "near-touchline",
    title: "Near touchline",
    copy: "The carrier hugs the near sideline. Open the tray and check the shifted visual centre.",
    home: points([
      [10, 10],
      [8, 9],
      [7, 8],
      [5, 9],
      [6, 6],
      [9, 7],
      [4, 10],
    ]),
    away: midfieldAway,
    tray: false,
  },
  {
    id: "home-goal",
    title: "Home goal end",
    copy: "Deep in the home end zone. Team reset should still show the eligible teammates.",
    home: points([
      [0, 5],
      [2, 3],
      [3, 7],
      [4, 5],
      [2, 5],
      [1, 2],
      [3, 9],
    ]),
    away: midfieldAway,
    tray: false,
  },
  {
    id: "away-goal",
    title: "Away goal end",
    copy: "The carrier is in the opposite end zone. Compare the long pan back to the team.",
    home: points([
      [19, 5],
      [16, 3],
      [17, 7],
      [14, 5],
      [16, 5],
      [18, 2],
      [15, 9],
    ]),
    away: points([
      [18, 6],
      [17, 3],
      [16, 7],
      [14, 4],
      [13, 8],
      [15, 2],
      [12, 6],
    ]),
    tray: false,
  },
  {
    id: "spread",
    title: "Widely spread",
    copy: "Eligible teammates span almost the whole pitch. Keep zoom may leave some outside the view.",
    home: points([
      [10, 5],
      [1, 1],
      [18, 9],
      [2, 9],
      [17, 1],
      [7, 8],
      [13, 2],
    ]),
    away: midfieldAway,
    tray: false,
  },
  {
    id: "block",
    title: "Crowded block + tray",
    copy: "A tight scrum with the dice tray already open. Block and tray changes must preserve zoom.",
    home: points([
      [9, 5],
      [8, 4],
      [8, 6],
      [7, 5],
      [6, 5],
      [7, 3],
      [7, 7],
    ]),
    away: points([
      [10, 5],
      [10, 4],
      [10, 6],
      [11, 5],
      [12, 5],
      [11, 3],
      [11, 7],
    ]),
    tray: true,
  },
  {
    id: "isolated",
    title: "Isolated carrier",
    copy: "The carrier is far from six teammates. A and B pan back the same way if those teammates already fit at the current zoom.",
    home: points([
      [18, 9],
      [3, 3],
      [4, 5],
      [5, 7],
      [2, 5],
      [4, 2],
      [3, 8],
    ]),
    away: midfieldAway,
    tray: false,
  },
];

export const teamName = (team: Team) =>
  team === "home" ? "Reikland" : "Ironjaw";
export const otherTeam = (team: Team): Team =>
  team === "home" ? "away" : "home";
export function world(point: Point): Point {
  const pixel = gridToPixel(point.x, point.y);
  return { x: 1351.145 + pixel.x, y: 1115.12 + pixel.y };
}
export function newPlayers(scenario: Scenario): Player[] {
  return (["home", "away"] satisfies Team[]).flatMap((team) =>
    scenario[team].map((point, i) => ({
      ...point,
      team,
      number: i + 1,
      id: `${team}-${i + 1}`,
      spent: false,
    }))
  );
}
export function centre(area: Area): Point {
  return { x: (area.left + area.right) / 2, y: (area.top + area.bottom) / 2 };
}
export function frame(players: Point[], area: Area, maxZoom: number): Camera {
  const positions = players.map(world);
  const x0 = Math.min(...positions.map((p) => p.x)) - 64;
  const x1 = Math.max(...positions.map((p) => p.x)) + 64;
  const y0 = Math.min(...positions.map((p) => p.y)) - 90;
  const y1 = Math.max(...positions.map((p) => p.y)) + 46;
  return {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    zoom: Math.min(
      maxZoom,
      (area.right - area.left - 32) / (x1 - x0),
      (area.bottom - area.top - 32) / (y1 - y0)
    ),
  };
}
export const pitchCorners = points([
  [0, 0],
  [19, 0],
  [19, 10],
  [0, 10],
]);
