import { fork, type ChildProcess } from "node:child_process";

interface WorkerSpawn {
  entry: string;
  args: string[];
  count: number;
}

type AttachWorker = (
  child: ChildProcess,
  finish: () => void,
  fail: (error: Error) => void
) => void;

function spawnWorker(
  spawn: WorkerSpawn,
  attach: AttachWorker,
  children: ChildProcess[]
): Promise<void> {
  return new Promise<void>((finish, fail) => {
    const child = fork(spawn.entry, spawn.args, {
      execArgv: process.execArgv,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    children.push(child);
    child.stderr?.on("data", (data: Buffer) => process.stderr.write(data));
    child.on("error", fail);
    attach(child, finish, fail);
  });
}

export async function forkWorkers(
  spawn: WorkerSpawn,
  attach: AttachWorker
): Promise<void> {
  const children: ChildProcess[] = [];
  try {
    await Promise.all(
      Array.from({ length: spawn.count }, () =>
        spawnWorker(spawn, attach, children)
      )
    );
  } finally {
    children.forEach((child) => child.kill());
  }
}
