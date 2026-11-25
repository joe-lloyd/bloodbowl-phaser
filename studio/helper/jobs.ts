import type { StudioJob } from "../boundary/studio";
import type { OnLine } from "./run";

type Work = (onLine: OnLine) => Promise<void>;

export class JobQueue {
  private readonly jobs = new Map<string, StudioJob>();
  private tail: Promise<void> = Promise.resolve();
  latest: StudioJob | null = null;

  add(kind: StudioJob["kind"], key: string, work: Work): StudioJob {
    const job: StudioJob = { id: crypto.randomUUID(), kind, key, status: "queued", log: [] };
    this.jobs.set(job.id, job);
    this.latest = job;
    this.tail = this.tail.then(() => this.start(job, work));
    return job;
  }

  get(id: string): StudioJob | undefined {
    return this.jobs.get(id);
  }

  private async start(job: StudioJob, work: Work): Promise<void> {
    job.status = "running";
    try {
      await work((line) => job.log.push(line));
      job.status = "done";
    } catch (error) {
      job.log.push(error instanceof Error ? error.message : String(error));
      job.status = "failed";
    }
  }
}
