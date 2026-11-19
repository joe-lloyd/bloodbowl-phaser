import { forkWorkers } from "../catalogue-study/workers";

export async function processPool<Job>(
  entry: string,
  args: string[],
  jobs: Job[],
  workers: number
): Promise<void> {
  let next = 0,
    done = 0;
  const started = Date.now();
  await forkWorkers(
    {
      entry,
      args: [...args, "--worker"],
      count: Math.min(workers, jobs.length),
    },
    (child, yes, no) => {
      let current: Job | undefined;
      child.on("message", (message: { done?: string; error?: string }) => {
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
      });
      child.on("exit", (code) => {
        current || code !== 0
          ? no(new Error("Worker exited during a job"))
          : yes();
      });
    }
  );
}
