import humanBase from "../../public/sprites/bloodbowl/human_blitzer/base.json";
import humanKit1 from "../../public/sprites/bloodbowl/human_blitzer/kit1.json";
import humanKit2 from "../../public/sprites/bloodbowl/human_blitzer/kit2.json";
import orcBase from "../../public/sprites/bloodbowl/orc_blitzer/base.json";
import orcKit1 from "../../public/sprites/bloodbowl/orc_blitzer/kit1.json";
import orcKit2 from "../../public/sprites/bloodbowl/orc_blitzer/kit2.json";
import { ISO } from "../../src/game/elements/GridUtils";
import {
  centre,
  world,
  type Area,
  type Camera,
  type Player,
  type Point,
  type Team,
} from "./model";

type AtlasFrame = (typeof humanBase.frames)["idle/e/0"];
type ArtLayer = { image: HTMLCanvasElement; frames: Map<string, AtlasFrame> };
const colors = { home: "#467cd4", away: "#c44a3d" };

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("This playground needs a browser with canvas support.");
  return ctx;
}
async function load(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}
async function tinted(
  url: string,
  tint: string | null
): Promise<HTMLCanvasElement> {
  const image = await load(url);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = context(canvas);
  ctx.drawImage(image, 0, 0);
  if (tint) {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, image.width, image.height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(image, 0, 0);
  }
  return canvas;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private readonly stadium = document.createElement("canvas");
  private readonly art = new Map<Team, ArtLayer[]>();
  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = context(canvas);
  }

  async load() {
    const layers = await Promise.all([
      tinted("./assets/stadium/base.webp", null),
      tinted("./assets/stadium/home.webp", colors.home),
      tinted("./assets/stadium/away.webp", colors.away),
    ]);
    this.stadium.width = 3171;
    this.stadium.height = 2226;
    const ctx = context(this.stadium);
    layers.forEach((layer) => ctx.drawImage(layer, 0, 0));
    const teams = [
      {
        team: "home",
        model: "human_blitzer",
        data: [humanBase, humanKit1, humanKit2],
      },
      { team: "away", model: "orc_blitzer", data: [orcBase, orcKit1, orcKit2] },
    ] satisfies {
      team: Team;
      model: string;
      data: { frames: Record<string, AtlasFrame> }[];
    }[];
    await Promise.all(
      teams.map(async ({ team, model, data }) => {
        const art = await Promise.all(
          data.map(async (atlas, index) => ({
            image: await tinted(
              `./assets/${model}/${["base", "kit1", "kit2"][index]}.png`,
              [null, colors[team], "#e4c985"][index]
            ),
            frames: new Map(Object.entries(atlas.frames)),
          }))
        );
        this.art.set(team, art);
      })
    );
  }

  draw({
    camera,
    area,
    players,
    selected,
    animation,
    moving,
    guides,
    time,
  }: {
    camera: Camera;
    area: Area;
    players: Player[];
    selected: string | null;
    animation: { id: string; start: number } | null;
    moving: string | null;
    guides: boolean;
    time: number;
  }) {
    const { canvas, ctx } = this;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0805";
    ctx.fillRect(0, 0, width, height);
    const anchor = centre(area);
    ctx.translate(anchor.x, anchor.y);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    ctx.drawImage(this.stadium, 0, 0);
    const active = players.find((p) => p.id === selected);
    if (active) this.reach(active);
    [...players]
      .sort((a, b) => world(a).y - world(b).y)
      .forEach((player) => {
        const action =
          animation?.id === player.id && time - animation.start < 600
            ? "block"
            : moving === player.id
              ? "run"
              : "idle";
        const index =
          action === "idle"
            ? Math.floor(time / 160 + player.number) % 8
            : Math.floor(time / 85) % 8;
        this.player(
          player,
          selected === player.id,
          `${action}/${player.team === "home" ? "e" : "w"}/${index}`
        );
      });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (guides) this.guides(area);
  }

  private reach(player: Player) {
    const ctx = this.ctx;
    for (
      let x = Math.max(0, Math.round(player.x) - 3);
      x <= Math.min(19, Math.round(player.x) + 3);
      x++
    ) {
      for (
        let y = Math.max(0, Math.round(player.y) - 3);
        y <= Math.min(10, Math.round(player.y) + 3);
        y++
      ) {
        const pos = world({ x, y });
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - ISO.tileHeight / 2);
        ctx.lineTo(pos.x + ISO.tileWidth / 2, pos.y);
        ctx.lineTo(pos.x, pos.y + ISO.tileHeight / 2);
        ctx.lineTo(pos.x - ISO.tileWidth / 2, pos.y);
        ctx.closePath();
        ctx.fillStyle = "#72aaee12";
        ctx.strokeStyle = "#8eb7e840";
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  private player(player: Player, selected: boolean, frameName: string) {
    const ctx = this.ctx;
    const pos = world(player);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.globalAlpha = player.spent ? 0.4 : 1;
    ctx.fillStyle = "#0007";
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = selected ? "#ffe084" : colors[player.team];
    ctx.lineWidth = selected ? 4 : 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 33, 15, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (const layer of this.art.get(player.team) ?? []) {
      const data = layer.frames.get(frameName);
      if (!data) continue;
      const { frame: f, spriteSourceSize: s } = data;
      ctx.drawImage(
        layer.image,
        f.x,
        f.y,
        f.w,
        f.h,
        s.x - 64,
        s.y - 77,
        f.w,
        f.h
      );
    }
    ctx.font = "bold 13px Georgia";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#fff6db";
    ctx.strokeText(String(player.number), 0, 23);
    ctx.fillText(String(player.number), 0, 23);
    if (selected) {
      ctx.fillStyle = "#ffe084";
      ctx.beginPath();
      ctx.moveTo(-5, -72);
      ctx.lineTo(5, -72);
      ctx.lineTo(0, -65);
      ctx.fill();
    }
    ctx.restore();
  }

  private guides(area: Area) {
    const ctx = this.ctx;
    const c = centre(area);
    ctx.strokeStyle = "#cce9f899";
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 1;
    ctx.strokeRect(
      area.left,
      area.top,
      area.right - area.left,
      area.bottom - area.top
    );
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(c.x - 12, c.y);
    ctx.lineTo(c.x + 12, c.y);
    ctx.moveTo(c.x, c.y - 12);
    ctx.lineTo(c.x, c.y + 12);
    ctx.stroke();
    ctx.fillStyle = "#d0e7f2";
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("Usable view centre", c.x + 18, c.y - 9);
  }
}

export function project(point: Point, camera: Camera, area: Area): Point {
  const c = centre(area);
  return {
    x: c.x + (point.x - camera.x) * camera.zoom,
    y: c.y + (point.y - camera.y) * camera.zoom,
  };
}
