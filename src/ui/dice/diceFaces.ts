import * as THREE from "three";
import type { DiceRoll, DiceTeam } from "./diceScene";

/**
 * The pictures on the dice and the coin: pips, numbers, block icons and team
 * crests, drawn on canvas once and reused as textures.
 */

/** Block faces in die order: value 1..6 shows this face. */
export const BLOCK_FACES = [
  "skull",
  "both-down",
  "push",
  "push",
  "pow-dodge",
  "pow",
] as const;

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
const textures = new Map<string, THREE.CanvasTexture>();

function star(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  points = 9
) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.55 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.fill();
}

function skull(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hole: string
) {
  const ink = g.fillStyle;
  g.beginPath();
  g.arc(x, y, r, Math.PI * 0.85, Math.PI * 2.15);
  g.fill();
  g.fillRect(x - r * 0.62, y + r * 0.3, r * 1.24, r * 0.75);
  g.fillStyle = hole;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(x + sx * r * 0.38, y + r * 0.05, r * 0.26, 0, 7);
    g.fill();
  }
  g.fillStyle = ink;
}

function arrow(
  g: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  w: number
) {
  g.beginPath();
  g.moveTo(x0, y - w / 2);
  g.lineTo(x1 - w * 1.3, y - w / 2);
  g.lineTo(x1 - w * 1.3, y - w * 1.3);
  g.lineTo(x1, y);
  g.lineTo(x1 - w * 1.3, y + w * 1.3);
  g.lineTo(x1 - w * 1.3, y + w / 2);
  g.lineTo(x0, y + w / 2);
  g.fill();
}

function blockIcon(
  g: CanvasRenderingContext2D,
  face: string,
  S: number,
  body: string
) {
  if (face === "skull") skull(g, S / 2, S * 0.45, S * 0.3, body);
  else if (face === "both-down") {
    skull(g, S * 0.33, S * 0.44, S * 0.19, body);
    star(g, S * 0.7, S * 0.5, S * 0.22);
  } else if (face === "push") arrow(g, S * 0.18, S * 0.84, S / 2, S * 0.17);
  else if (face === "pow-dodge") {
    star(g, S / 2, S / 2, S * 0.4, 11);
    g.fillStyle = body;
    g.fillRect(S * 0.46, S * 0.3, S * 0.08, S * 0.25);
    g.beginPath();
    g.arc(S / 2, S * 0.65, S * 0.045, 0, 7);
    g.fill();
  } else {
    star(g, S / 2, S / 2, S * 0.4, 11);
    g.fillStyle = body;
    g.font = `bold ${S * 0.2}px Impact, Georgia, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("POW", S / 2, S / 2 + 4);
  }
}

/** The team's mark on the six. */
function crest(
  g: CanvasRenderingContext2D,
  team: DiceTeam,
  S: number,
  body: string
) {
  const ink = g.fillStyle;
  if (team.race === "orc") {
    g.beginPath();
    g.ellipse(S / 2, S / 2, S * 0.34, S * 0.36, 0, 0, 7);
    g.fill();
    g.fillStyle = body;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(S / 2 + sx * S * 0.27, S * 0.33);
      g.lineTo(S / 2 + sx * S * 0.05, S * 0.43);
      g.lineTo(S / 2 + sx * S * 0.07, S * 0.47);
      g.lineTo(S / 2 + sx * S * 0.28, S * 0.39);
      g.fill();
      g.beginPath();
      g.arc(S / 2 + sx * S * 0.14, S * 0.5, S * 0.045, 0, 7);
      g.fill();
    }
    g.fillRect(S * 0.32, S * 0.63, S * 0.36, S * 0.09);
  } else if (team.race === "human") {
    g.fillRect(S * 0.46, S * 0.38, S * 0.08, S * 0.46);
    g.fillRect(S * 0.27, S * 0.32, S * 0.46, S * 0.17);
    g.beginPath();
    g.moveTo(S * 0.3, S * 0.27);
    g.lineTo(S * 0.3, S * 0.13);
    g.lineTo(S * 0.38, S * 0.2);
    g.lineTo(S * 0.5, S * 0.09);
    g.lineTo(S * 0.62, S * 0.2);
    g.lineTo(S * 0.7, S * 0.13);
    g.lineTo(S * 0.7, S * 0.27);
    g.fill();
  } else {
    // Any other team: its initial on a shield.
    g.beginPath();
    g.moveTo(S * 0.22, S * 0.2);
    g.lineTo(S * 0.78, S * 0.2);
    g.lineTo(S * 0.78, S * 0.55);
    g.quadraticCurveTo(S * 0.78, S * 0.8, S * 0.5, S * 0.88);
    g.quadraticCurveTo(S * 0.22, S * 0.8, S * 0.22, S * 0.55);
    g.fill();
    g.fillStyle = body;
    g.font = `bold ${S * 0.4}px Georgia, serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(team.initial, S / 2, S * 0.53);
  }
  g.fillStyle = ink;
}

/** A canvas texture, drawn once per key. */
function cachedTexture(
  key: string,
  draw: (g: CanvasRenderingContext2D, S: number) => void
): THREE.CanvasTexture {
  const cached = textures.get(key);
  if (cached) return cached;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  draw(c.getContext("2d")!, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(key, tex);
  return tex;
}

/** Where the pips sit on a D6 face, in quarters of its width. */
const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [
    [1, 1],
    [3, 3],
  ],
  3: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  4: [
    [1, 1],
    [3, 1],
    [1, 3],
    [3, 3],
  ],
  5: [
    [1, 1],
    [3, 1],
    [2, 2],
    [1, 3],
    [3, 3],
  ],
};

/** A D6 face: the pips, or the team's crest on the six. */
function d6Face(
  g: CanvasRenderingContext2D,
  team: DiceTeam,
  value: number,
  S: number,
  body: string
) {
  if (value === 6) {
    crest(g, team, S, body);
    return;
  }
  for (const [x, y] of PIPS[value]) {
    g.beginPath();
    g.arc((x * S) / 4, (y * S) / 4, value === 1 ? 30 : 24, 0, 7);
    g.fill();
  }
}

function d16Face(g: CanvasRenderingContext2D, value: number, S: number) {
  g.font = `bold ${S * 0.28}px Georgia, serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(value), S / 2, S * 0.65);
  // Six and nine stay unambiguous as the die tumbles.
  if (value === 6 || value === 9)
    g.fillRect(S * 0.42, S * 0.81, S * 0.16, S * 0.025);
}

/** A face in the team's kit: primary body, secondary ink. */
function faceTexture(roll: DiceRoll, value: number): THREE.CanvasTexture {
  const key = [roll.kind, value, roll.team.key].join(":");
  return cachedTexture(key, (g, S) => {
    const body = hex(roll.team.primary);
    const ink = hex(roll.team.secondary);
    g.fillStyle = body;
    g.fillRect(0, 0, S, S);
    g.fillStyle = g.strokeStyle = ink;
    if (roll.kind === "d16") d16Face(g, value, S);
    else if (roll.kind === "d6") d6Face(g, roll.team, value, S, body);
    else blockIcon(g, BLOCK_FACES[value - 1], S, body);
  });
}

export function faceMaterial(roll: DiceRoll, value: number): THREE.Material {
  return new THREE.MeshPhysicalMaterial({
    map: faceTexture(roll, value),
    roughness: 0.42,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
  });
}

export function coinTexture(team: DiceTeam): THREE.CanvasTexture {
  return cachedTexture(["coin", team.key].join(":"), (g, S) => {
    const body = hex(team.primary);
    const ink = hex(team.secondary);
    g.fillStyle = body;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = g.fillStyle = ink;
    g.lineWidth = 10;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.43, 0, 7);
    g.stroke();
    g.save();
    g.translate(S * 0.17, S * 0.17);
    g.scale(0.66, 0.66);
    crest(g, team, S, body);
    g.restore();
  });
}

/** A coin face as an image, to show the coach which side is whose. */
export function coinFaceImage(team: DiceTeam): string {
  return (coinTexture(team).image as HTMLCanvasElement).toDataURL();
}
