import { spawn } from "node:child_process";

export type OnLine = (line: string) => void;

interface Command {
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly onLine?: OnLine;
}

const TAIL_LINES = 8;

function splitLines(onLine: OnLine): (chunk: Buffer) => void {
  let rest = "";
  return (chunk) => {
    const lines = (rest + chunk.toString("utf8")).split(/\r?\n/);
    rest = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onLine(line);
  };
}

export function run({ program, args, cwd, onLine }: Command): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const lines: string[] = [];
    const take = (line: string) => {
      lines.push(line);
      onLine?.(line);
    };
    child.stdout.on("data", splitLines(take));
    child.stderr.on("data", splitLines(take));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(lines.join("\n"));
      else reject(new Error(`${program} failed with code ${String(code)}\n${lines.slice(-TAIL_LINES).join("\n")}`));
    });
  });
}
