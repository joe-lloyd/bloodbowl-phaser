import { type PitchLayout, isPlayableSquare } from "../variants/pitchLayouts";
import { activeLayout } from "../variants/activeMatch";
import {
  type DeploymentRole,
  type FormationPosition,
} from "../../types/SetupTypes";
import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";

export type DeploymentUse = "kick" | "receive" | "any";

interface Slot {
  readonly back: number;
  readonly lane: number;
  readonly role: DeploymentRole;
  readonly wide?: true;
}

export interface Deployment {
  readonly name: string;
  readonly use: DeploymentUse;
  readonly slots: readonly Slot[];
}

const TOUCHLINE = 99;
const INNER_WIDE = 4;

const at = (back: number, lane: number, role: DeploymentRole): Slot => ({
  back,
  lane,
  role,
});
const wide = (back: number, lane: number, role: DeploymentRole): Slot => ({
  back,
  lane,
  role,
  wide: true,
});
const line = (lane: number): Slot => at(0, lane, "line");

export const DEPLOYMENTS: readonly Deployment[] = [
  {
    name: "Balanced",
    use: "any",
    slots: [
      line(-1),
      line(0),
      line(1),
      at(2, -3, "support"),
      at(2, 3, "support"),
      at(4, -1, "deep"),
      at(4, 1, "support"),
    ],
  },
  {
    name: "Spread",
    use: "any",
    slots: [
      line(-2),
      line(0),
      line(2),
      wide(2, -TOUCHLINE, "flank"),
      wide(2, TOUCHLINE, "flank"),
      at(4, -TOUCHLINE, "deep"),
      at(4, TOUCHLINE, "support"),
    ],
  },
  {
    name: "Bunker",
    use: "any",
    slots: [
      line(-1),
      line(0),
      line(1),
      at(1, -1, "support"),
      at(1, 1, "support"),
      at(2, 0, "support"),
      at(4, 0, "deep"),
    ],
  },
  {
    name: "Kick: Blitz line",
    use: "kick",
    slots: [
      line(-2),
      line(-1),
      line(0),
      line(1),
      line(2),
      wide(0, -INNER_WIDE, "flank"),
      wide(0, INNER_WIDE, "flank"),
    ],
  },
  {
    name: "Kick: Press",
    use: "kick",
    slots: [
      line(-1),
      line(0),
      line(1),
      wide(0, -INNER_WIDE, "flank"),
      wide(0, INNER_WIDE, "flank"),
      at(2, 0, "support"),
      at(4, 0, "deep"),
    ],
  },
  {
    name: "Kick: Screen",
    use: "kick",
    slots: [
      line(-1),
      line(0),
      line(1),
      at(2, -3, "support"),
      at(2, 3, "support"),
      at(3, 0, "support"),
      at(5, 0, "deep"),
    ],
  },
  {
    name: "Receive: Wedge",
    use: "receive",
    slots: [
      line(-1),
      line(0),
      line(1),
      at(1, -2, "support"),
      at(1, 2, "support"),
      at(2, 0, "deep"),
      at(3, 0, "support"),
    ],
  },
  {
    name: "Receive: Full line",
    use: "receive",
    slots: [
      line(-2),
      line(-1),
      line(0),
      line(1),
      line(2),
      at(3, -1, "deep"),
      at(3, 1, "support"),
    ],
  },
  {
    name: "Receive: Flank",
    use: "receive",
    slots: [
      line(-1),
      line(0),
      line(1),
      wide(1, -INNER_WIDE, "flank"),
      wide(1, INNER_WIDE, "flank"),
      at(3, -1, "deep"),
      at(3, 1, "support"),
    ],
  },
];

export function setupLabel(name: string): string {
  return `Set up in the ${name} formation`;
}

const squareKey = (x: number, y: number) => `${String(x)},${String(y)}`;

function ring(centre: { x: number; y: number }, reach: number) {
  const squares: { x: number; y: number }[] = [];
  for (let dx = -reach; dx <= reach; dx++)
    for (let dy = -reach; dy <= reach; dy++)
      if (Math.max(Math.abs(dx), Math.abs(dy)) === reach)
        squares.push({ x: centre.x + dx, y: centre.y + dy });
  return squares;
}

export interface SetupArea {
  readonly layout: PitchLayout;
  readonly isTeam1: boolean;
}

function setupColumns({ layout, isTeam1 }: SetupArea) {
  const los = isTeam1
    ? layout.lineOfScrimmage.team1
    : layout.lineOfScrimmage.team2;
  return isTeam1
    ? { los, minX: 0, maxX: los }
    : { los, minX: los, maxX: layout.cols - 1 };
}

function nearestFree(
  area: SetupArea,
  wanted: { x: number; y: number },
  taken: Set<string>
): { x: number; y: number } {
  const { minX, maxX } = setupColumns(area);
  const free = ({ x, y }: { x: number; y: number }) =>
    x >= minX &&
    x <= maxX &&
    isPlayableSquare(area.layout, { x, y }) &&
    !taken.has(squareKey(x, y));
  for (let reach = 0; reach < area.layout.cols; reach++) {
    const found = ring(wanted, reach).find(free);
    if (found) return found;
  }
  return wanted;
}

export function settleSquares<T extends { x: number; y: number }>(
  area: SetupArea,
  wanted: readonly T[]
): T[] {
  const taken = new Set<string>();
  return wanted.map((position) => {
    const square = nearestFree(area, position, taken);
    taken.add(squareKey(square.x, square.y));
    return { ...position, ...square };
  });
}

function slotRow(layout: PitchLayout, slot: Slot): number {
  const mid = Math.floor(layout.rows / 2);
  if (slot.wide && Math.abs(slot.lane) === INNER_WIDE) {
    const { top, bottom } = layout.wideZoneRows;
    return slot.lane < 0 ? top.max : bottom.min;
  }
  const rows = slot.wide ? { min: 0, max: layout.rows - 1 } : layout.centreRows;
  return Math.min(rows.max, Math.max(rows.min, mid + slot.lane));
}

function slotSquare(area: SetupArea, slot: Slot): { x: number; y: number } {
  const { layout, isTeam1 } = area;
  const { los, minX, maxX } = setupColumns(area);
  const x = isTeam1 ? los - slot.back : los + slot.back;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: slotRow(layout, slot),
  };
}

export function deploymentSquares(
  area: SetupArea,
  deployment: Deployment
): FormationPosition[] {
  return settleSquares(
    area,
    deployment.slots.map((slot, index) => ({
      playerId: String(index),
      role: slot.role,
      ...slotSquare(area, slot),
    }))
  );
}

const UNRELIABLE = [
  SkillType.REALLY_STUPID,
  SkillType.BONE_HEAD,
  SkillType.TAKE_ROOT,
  SkillType.ANIMAL_SAVAGERY,
  SkillType.UNCHANNELLED_FURY,
] as const;

function count(player: Player, skills: readonly SkillType[]): number {
  return skills.filter((skill) => hasSkill(player.skills, skill)).length;
}

const agility = (player: Player) => 7 - player.stats.AG;

function receivingFit(player: Player, role: DeploymentRole): number {
  const { MA, ST, AV } = player.stats;
  const unreliable = count(player, UNRELIABLE);
  switch (role) {
    case "line":
      return (
        3 * ST +
        AV +
        2 * count(player, [SkillType.BLOCK, SkillType.GUARD]) +
        count(player, [SkillType.STAND_FIRM, SkillType.MIGHTY_BLOW]) -
        3 * count(player, [SkillType.SURE_HANDS, SkillType.CATCH])
      );
    case "support":
      return (
        2 * ST +
        MA +
        2 * count(player, [SkillType.BLOCK]) +
        count(player, [SkillType.GUARD, SkillType.DODGE])
      );
    case "flank":
      return (
        2 * MA +
        2 * agility(player) +
        3 * count(player, [SkillType.CATCH]) +
        count(player, [
          SkillType.SPRINT,
          SkillType.SURE_FEET,
          SkillType.DODGE,
        ]) -
        10 * count(player, [SkillType.NO_BALL]) -
        4 * unreliable
      );
    case "deep":
      return (
        5 * count(player, [SkillType.SURE_HANDS]) +
        3 * count(player, [SkillType.BIG_HAND]) +
        2 * count(player, [SkillType.EXTRA_ARMS, SkillType.CATCH]) +
        MA +
        2 * agility(player) +
        count(player, [SkillType.DODGE]) -
        20 * count(player, [SkillType.NO_BALL]) -
        8 * unreliable -
        3 * count(player, [SkillType.LONER])
      );
  }
}

function kickingFit(player: Player, role: DeploymentRole): number {
  const { MA, ST } = player.stats;
  switch (role) {
    case "line":
      return (
        2 * MA +
        2 * ST +
        3 * count(player, [SkillType.TACKLE, SkillType.STRIP_BALL]) +
        2 *
          count(player, [
            SkillType.JUGGERNAUT,
            SkillType.LEAP,
            SkillType.POGO,
          ]) +
        count(player, [SkillType.FRENZY, SkillType.DAUNTLESS, SkillType.BLOCK])
      );
    case "support":
      return (
        MA +
        2 * ST +
        2 * count(player, [SkillType.BLOCK, SkillType.TACKLE]) +
        count(player, [SkillType.GUARD])
      );
    case "flank":
      return (
        2 * MA +
        agility(player) +
        2 * count(player, [SkillType.TACKLE, SkillType.DIVING_TACKLE]) +
        count(player, [SkillType.BLOCK])
      );
    case "deep":
      return (
        2 * MA +
        agility(player) +
        3 * count(player, [SkillType.TACKLE, SkillType.DIVING_TACKLE]) +
        count(player, [SkillType.DIVING_CATCH, SkillType.BLOCK]) -
        5 * count(player, [SkillType.LONER]) -
        5 * count(player, UNRELIABLE)
      );
  }
}

function roleFit(
  player: Player,
  role: DeploymentRole,
  kicking: boolean
): number {
  const contact = role === "line" && activeLayout().noMansLand === null;
  return kicking && !contact
    ? kickingFit(player, role)
    : receivingFit(player, role);
}

export interface Assignment {
  readonly squares: readonly FormationPosition[];
  readonly players: readonly Player[];
  readonly kicking: boolean;
  readonly mustField?: string | undefined;
}

interface Step {
  readonly best: readonly number[];
  readonly fit: readonly number[];
  readonly required: boolean;
}

function extend({ best, fit, required }: Step) {
  const next = required ? best.map(() => -Infinity) : best.slice();
  const choice = best.map(() => -1);
  best.forEach((base, mask) => {
    if (base === -Infinity) return;
    fit.forEach((gain, s) => {
      const into = mask | (1 << s);
      if (into === mask || base + gain <= (next[into] ?? -Infinity)) return;
      next[into] = base + gain;
      choice[into] = s;
    });
  });
  return { next, choice };
}

export function assignPlayers({
  squares,
  players,
  kicking,
  mustField,
}: Assignment): FormationPosition[] {
  const slots = squares.slice(0, Math.min(squares.length, players.length));
  const full = (1 << slots.length) - 1;
  let best = Array.from({ length: full + 1 }, (_, mask) =>
    mask ? -Infinity : 0
  );
  const choices = players.map((player) => {
    const step = extend({
      best,
      fit: slots.map((slot) =>
        roleFit(player, slot.role ?? "support", kicking)
      ),
      required: player.id === mustField,
    });
    best = step.next;
    return step.choice;
  });
  const placed: FormationPosition[] = [];
  let mask = full;
  for (let p = players.length - 1; p >= 0; p--) {
    const s = choices[p]?.[mask] ?? -1;
    const slot = slots[s];
    const player = players[p];
    if (!slot || !player) continue;
    placed.push({ ...slot, playerId: player.id });
    mask &= ~(1 << s);
  }
  return placed.reverse();
}
