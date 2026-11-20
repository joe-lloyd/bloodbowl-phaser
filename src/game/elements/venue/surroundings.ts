import {
  fillRect,
  type GroundRect,
  type IsoCanvas,
  isoBlock,
  onFrontFace,
  onGround,
  onScreen,
  screenPoint,
  shade,
} from "./isoCanvas";

export interface Backline {
  y0: number;
  y1: number;
  from: number;
  to: number;
}

const PLASTER = [
  "#3b3128",
  "#2f2a26",
  "#46382a",
  "#4a2c22",
  "#353a3f",
] as const;

function pick<T>(iso: IsoCanvas, items: readonly [T, ...T[]]): T {
  return items[Math.floor(iso.random() * items.length)] ?? items[0];
}

function windows(iso: IsoCanvas, house: GroundRect & { height: number }): void {
  const face = onFrontFace(iso, house.y1);
  for (let x = house.x0 + 0.35; x < house.x1 - 0.5; x += 0.85) {
    for (let h = 2.4; h < house.height - 1; h += 2.2) {
      const lit = iso.random() < 0.4;
      fillRect(
        face,
        { x0: x, y0: h, x1: x + 0.4, y1: h + 1.2 },
        lit ? "#d9a24e" : "#14110e"
      );
      fillRect(
        face,
        { x0: x + 0.18, y0: h, x1: x + 0.22, y1: h + 1.2 },
        "#1f1812"
      );
    }
  }
  const door = house.x0 + (house.x1 - house.x0) / 2 - 0.25;
  fillRect(face, { x0: door, y0: 0, x1: door + 0.5, y1: 1.9 }, "#1b130d");
}

export function paintHouses(iso: IsoCanvas, line: Backline): void {
  for (let x = line.from; x < line.to; ) {
    const width = 2.2 + iso.random() * 1.6;
    const house = {
      x0: x,
      x1: Math.min(line.to, x + width),
      y0: line.y0,
      y1: line.y1,
      height: 5 + iso.random() * 3.5,
    };
    const front = pick(iso, PLASTER);
    isoBlock(iso, house, { top: "#1d1915", front, side: shade(front, -0.3) });
    windows(iso, house);
    x += width;
  }
}

function glow(
  iso: IsoCanvas,
  at: { x: number; y: number; lift: number },
  radius: number
): void {
  const ctx = onScreen(iso);
  const point = screenPoint(iso, at);
  const light = ctx.createRadialGradient(
    point.x,
    point.y,
    0,
    point.x,
    point.y,
    radius
  );
  light.addColorStop(0, "rgba(255, 196, 110, 0.55)");
  light.addColorStop(1, "rgba(255, 196, 110, 0)");
  ctx.fillStyle = light;
  ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
}

export function paintLamps(
  iso: IsoCanvas,
  line: { y: number; xs: number[] }
): void {
  for (const x of line.xs) {
    isoBlock(
      iso,
      {
        x0: x - 0.06,
        x1: x + 0.06,
        y0: line.y - 0.06,
        y1: line.y + 0.06,
        height: 3.4,
      },
      { top: "#2a2a2a", front: "#1e1e1e", side: "#151515" }
    );
    isoBlock(
      iso,
      {
        x0: x - 0.15,
        x1: x + 0.15,
        y0: line.y - 0.15,
        y1: line.y + 0.15,
        height: 0.5,
        base: 3.4,
      },
      { top: "#3a2c18", front: "#f0c070", side: "#c89448" }
    );
    glow(iso, { x, y: line.y, lift: 3.6 }, 70);
  }
}

export function paintSea(iso: IsoCanvas, sea: GroundRect): void {
  const ctx = onGround(iso);
  const water = ctx.createLinearGradient(0, sea.y1, 0, sea.y0);
  water.addColorStop(0, "#15404a");
  water.addColorStop(1, "#061419");
  ctx.fillStyle = water;
  ctx.fillRect(sea.x0, sea.y0, sea.x1 - sea.x0, sea.y1 - sea.y0);
  ctx.lineWidth = 0.05;
  for (let y = sea.y1 - 0.2; y > sea.y0; y -= 0.6) {
    ctx.strokeStyle = `rgba(150, 200, 205, ${String(0.08 + 0.2 * ((y - sea.y0) / (sea.y1 - sea.y0)))})`;
    ctx.beginPath();
    for (let x = sea.x0; x < sea.x1; x += 0.5) {
      ctx.lineTo(x, y + Math.sin(x * 1.7 + y) * 0.08);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(225, 235, 225, 0.6)";
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  for (let x = sea.x0; x < sea.x1; x += 0.3)
    ctx.lineTo(x, sea.y1 + Math.sin(x * 2.3) * 0.12);
  ctx.stroke();
}

function fronds(
  ctx: CanvasRenderingContext2D,
  top: { x: number; y: number }
): void {
  ctx.fillStyle = "#1f4a2a";
  for (let leaf = 0; leaf < 7; leaf++) {
    const cos = Math.cos((leaf / 7) * Math.PI * 2);
    const sin = Math.sin((leaf / 7) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(
      top.x + cos * 50,
      top.y + sin * 20 - 25,
      top.x + cos * 80,
      top.y + sin * 32 + 22
    );
    ctx.quadraticCurveTo(top.x + cos * 40, top.y + sin * 14, top.x, top.y);
    ctx.fill();
  }
}

export function paintPalm(iso: IsoCanvas, at: { x: number; y: number }): void {
  const ctx = onScreen(iso);
  const base = screenPoint(iso, { ...at, lift: 0 });
  const lean = (iso.random() - 0.5) * 60;
  const top = { x: base.x + lean, y: base.y - 150 };
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(base.x + 30, base.y + 4, 45, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4b3522";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.quadraticCurveTo(base.x + lean * 0.1, base.y - 80, top.x, top.y);
  ctx.stroke();
  fronds(ctx, top);
}

function arch(
  face: CanvasRenderingContext2D,
  centre: number,
  height: number
): void {
  face.fillStyle = "#050505";
  face.beginPath();
  face.moveTo(centre - 1, 0);
  face.lineTo(centre - 1, height - 1.4);
  face.ellipse(centre, height - 1.4, 1, 1.4, 0, Math.PI, 0, true);
  face.lineTo(centre + 1, 0);
  face.fill();
}

export function paintSewerArches(iso: IsoCanvas, line: Backline): void {
  const wall = {
    x0: line.from,
    x1: line.to,
    y0: line.y0,
    y1: line.y1,
    height: 6,
  };
  isoBlock(iso, wall, { top: "#151916", front: "#2f362f", side: "#212621" });
  const face = onFrontFace(iso, line.y1);
  for (let h = 0.6; h < wall.height; h += 0.6) {
    fillRect(
      face,
      { x0: wall.x0, y0: h - 0.04, x1: wall.x1, y1: h },
      "rgba(0, 0, 0, 0.35)"
    );
  }
  for (let x = line.from + 3; x < line.to - 2; x += 6) {
    arch(face, x, 4.2);
    fillRect(face, { x0: x + 2.2, y0: 2.6, x1: x + 2.7, y1: 3.1 }, "#3d4a3b");
    fillRect(
      face,
      { x0: x + 2.3, y0: 0, x1: x + 2.6, y1: 2.6 },
      "rgba(96, 128, 46, 0.65)"
    );
  }
}

export function paintChannel(iso: IsoCanvas, channel: GroundRect): void {
  const ctx = onGround(iso);
  fillRect(ctx, channel, "#1d2a14");
  ctx.strokeStyle = "rgba(130, 160, 70, 0.3)";
  ctx.lineWidth = 0.04;
  for (let x = channel.x0; x < channel.x1; x += 0.9) {
    ctx.beginPath();
    ctx.moveTo(x, (channel.y0 + channel.y1) / 2);
    ctx.lineTo(x + 0.5, (channel.y0 + channel.y1) / 2 + 0.05);
    ctx.stroke();
  }
}

const CROWD = [
  "#5a4a3a",
  "#3f4a5a",
  "#6a3a32",
  "#4a5a3a",
  "#5e5a4c",
  "#3a3436",
] as const;

export function paintCrowd(iso: IsoCanvas, area: GroundRect): void {
  const count = Math.round((area.x1 - area.x0) * (area.y1 - area.y0) * 2.2);
  const people = Array.from({ length: count }, () => ({
    x: area.x0 + iso.random() * (area.x1 - area.x0),
    y: area.y0 + iso.random() * (area.y1 - area.y0),
    colour: pick(iso, CROWD),
  })).sort((a, b) => a.x + a.y - (b.x + b.y));
  const ctx = onScreen(iso);
  for (const person of people) {
    const at = screenPoint(iso, { ...person, lift: 0 });
    ctx.fillStyle = person.colour;
    ctx.beginPath();
    ctx.ellipse(at.x, at.y - 13, 7, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b08a6a";
    ctx.beginPath();
    ctx.arc(at.x, at.y - 31, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function paintBarricade(
  iso: IsoCanvas,
  run: { x: number; y0: number; y1: number }
): void {
  isoBlock(
    iso,
    { x0: run.x - 0.12, x1: run.x + 0.12, y0: run.y0, y1: run.y1, height: 0.9 },
    { top: "#7a5a36", front: "#5a3f24", side: "#4a321c" }
  );
}

export function paintVignette(
  iso: IsoCanvas,
  centre: { x: number; y: number },
  reach: number
): void {
  const ctx = onScreen(iso);
  const point = screenPoint(iso, centre);
  const shadow = ctx.createRadialGradient(
    point.x,
    point.y,
    reach * 0.55,
    point.x,
    point.y,
    reach * 1.25
  );
  shadow.addColorStop(0, "rgba(11, 8, 5, 0)");
  shadow.addColorStop(1, "rgba(11, 8, 5, 0.85)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
