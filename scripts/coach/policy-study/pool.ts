import { fork } from "node:child_process";
import type { PolicyJob } from "./schedule";

export async function processPool(
  entry: string,
  args: string[],
  jobs: PolicyJob[],
  workers: number
): Promise<void> {
  let next = 0,
    done = 0;
  const started = Date.now();
  const children: ReturnType<typeof fork>[] = [];
  try {
    await Promise.all(
      Array.from(
        { length: Math.min(workers, jobs.length) },
        () =>
          new Promise<void>((yes, no) => {
            let current: PolicyJob | undefined;
            const child = fork(entry, [...args, "--worker"], {
              execArgv: process.execArgv,
              stdio: ["ignore", "ignore", "pipe", "ipc"],
            });
            children.push(child);
            child.stderr?.on("data", (d) => process.stderr.write(d));
            child.on("error", no);
            child.on(
              "message",
              (message: { done?: string; error?: string }) => {
                if (message.error) {
                  no(new Error(message.error));
                  return;
                }
                if (message.done) {
                  done++;
                  if (done % 40 === 0 || done === jobs.length)
                    console.log(
                      JSON.stringify({
                        done,
                        total: jobs.length,
                        seconds: (Date.now() - started) / 1000,
                      })
                    );
                }
                current = jobs[next++];
                child.send(current ?? false);
              }
            );
            child.on("exit", (code) => {
              current || code !== 0
                ? no(new Error("Worker exited during a job"))
                : yes();
            });
          })
      )
    );
  } finally {
    children.forEach((child) => child.kill());
  }
}
