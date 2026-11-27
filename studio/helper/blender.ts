import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { studioEnvironment } from "../boundary/studio";
import { DRAFTS, FACTORY, WORK } from "./paths";
import { run, type OnLine } from "./run";

interface Renderer {
  readonly name: string;
  readonly preview: (key: string, args: readonly string[], onLine: OnLine) => Promise<void>;
  readonly layers: (key: string, onLine: OnLine) => Promise<void>;
}

const REMOTE = "bloodbowl-studio";
const REMOTE_BLENDER = String.raw`"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"`;
const CHARACTER_FLAG = "--characters";
const SOURCES = ["lib", "teams", "characters", "art", "reference", "team_render.ps1"];
const HEADLESS = ["-b", "--factory-startup", "--python", "lib/render.py", "--"];
const STYLE = ["--density", "2", "--dither", "0"];
const REPORTED = /^(DONE|PREVIEW|VERIFY|WARN|FAILED|NO SPEC|CHARACTER ERROR|TEAM FILE ERROR|BODY|LAYERS|Chunk)|CLIPPED|Error:/;

function reported(onLine: OnLine): OnLine {
  return (line) => {
    if (REPORTED.test(line)) onLine(line);
  };
}

function expectLine(output: string, start: string): void {
  if (output.split("\n").some((line) => line.startsWith(start))) return;
  const reason = output.split("\n").filter((line) => REPORTED.test(line));
  throw new Error(reason.join("\n") || "Blender stopped without a result");
}

function localRenderer(blender: string): Renderer {
  const render = (args: readonly string[], onLine: OnLine) =>
    run({ program: blender, args: [...HEADLESS, ...args, "--out", WORK], cwd: FACTORY, onLine: reported(onLine) });
  return {
    name: blender,
    preview: async (key, args, onLine) => {
      expectLine(await render([...args, CHARACTER_FLAG, DRAFTS], onLine), `PREVIEW ${key} `);
    },
    layers: async (key, onLine) => {
      const args = ["--layers", "--models", key, ...STYLE, "--frames", "run=12", "--verify", "2", CHARACTER_FLAG, DRAFTS];
      rmSync(path.join(WORK, "layered", key), { recursive: true, force: true });
      expectLine(await render(args, onLine), `DONE ${key} `);
    },
  };
}

function copy(from: string, to: string) {
  return run({ program: "scp", args: ["-q", "-o", "BatchMode=yes", from, to] });
}

function remoteRenderer(host: string): Renderer {
  const ssh = (command: string, onLine: OnLine) =>
    run({ program: "ssh", args: ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host, command], onLine: reported(onLine) });
  const inside = (command: string, onLine: OnLine) => ssh(`cd /d %USERPROFILE%\\${REMOTE} && ${command}`, onLine);

  const sync = async (onLine: OnLine) => {
    const bundle = path.join(WORK, "factory.tgz");
    const pack = ["COPYFILE_DISABLE=1", "tar", "--exclude=__pycache__", "-czf", bundle, "-C", FACTORY, ...SOURCES, "-C", WORK, "drafts"];
    await run({ program: "env", args: pack });
    await ssh(`if not exist ${REMOTE} mkdir ${REMOTE}`, onLine);
    await copy(bundle, `${host}:${REMOTE}/factory.tgz`);
    await inside("(rmdir /s /q lib teams characters art drafts 2>nul & tar -xzf factory.tgz)", onLine);
  };

  return {
    name: host,
    preview: async (key, args, onLine) => {
      await sync(onLine);
      const command = [REMOTE_BLENDER, ...HEADLESS, ...args, CHARACTER_FLAG, "drafts", "--out", "out-studio"].join(" ");
      expectLine(await inside(command, onLine), `PREVIEW ${key} `);
      mkdirSync(path.join(WORK, "preview"), { recursive: true });
      await copy(`${host}:${REMOTE}/out-studio/preview/${key}.png`, path.join(WORK, "preview"));
    },
    layers: async (key, onLine) => {
      await sync(onLine);
      await inside(`(del /q stash-out-studio\\${key}__*.pkl 2>nul & rmdir /s /q out-studio\\layered\\${key} 2>nul & echo cleared)`, onLine);
      await inside(`powershell -NoProfile -ExecutionPolicy Bypass -File team_render.ps1 -Models ${key} -Out out-studio -Characters drafts`, onLine);
      expectLine(await inside(String.raw`type logs-out-studio\pack-${key}.log`, onLine), `DONE ${key} `);
      await inside(`tar -czf layered.tgz -C out-studio/layered ${key}`, onLine);
      await copy(`${host}:${REMOTE}/layered.tgz`, path.join(WORK, "layered.tgz"));
      const layered = path.join(WORK, "layered");
      rmSync(path.join(layered, key), { recursive: true, force: true });
      mkdirSync(layered, { recursive: true });
      await run({ program: "tar", args: ["-xzf", path.join(WORK, "layered.tgz"), "-C", layered] });
    },
  };
}

export function createRenderer(): Renderer {
  const { BLENDER, STUDIO_BLENDER_HOST } = studioEnvironment();
  return BLENDER ? localRenderer(BLENDER) : remoteRenderer(STUDIO_BLENDER_HOST);
}

export function previewArgs(key: string, kit: { readonly primary: string; readonly secondary: string }): string[] {
  const a = kit.primary.slice(1);
  const b = kit.secondary.slice(1);
  return ["--models", key, "--preview", ...STYLE, "--kits", `${a}-${b},${b}-${a}`];
}
