import { useCallback, useEffect, useState } from "react";
import { fetchJob, fetchStudio, type StudioJob, type StudioState } from "../boundary/studio";
import { errorText } from "../../src/ui/errorText";

const POLL_MS = 1000;

function isActive(job: StudioJob | null): boolean {
  return job?.status === "queued" || job?.status === "running";
}

export function useStudio() {
  const [state, setState] = useState<StudioState | null>(null);
  const [job, setJob] = useState<StudioJob | null>(null);
  const [error, setError] = useState("");
  const active = isActive(job);
  const jobId = job?.id;

  const fail = useCallback((cause: unknown) => {
    setError(errorText(cause));
  }, []);
  const reload = useCallback(async () => {
    const next = await fetchStudio();
    setState(next);
    setJob((current) => current ?? next.job);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      reload().catch(fail);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [reload, fail]);

  useEffect(() => {
    if (!active || jobId === undefined) return;
    let ended = false;
    const show = (next: StudioJob) => {
      if (!ended) setJob(next);
    };
    const lose = (cause: unknown) => {
      if (ended) return;
      setJob(null);
      fail(cause);
    };
    const timer = setInterval(() => {
      fetchJob(jobId).then(show).catch(lose);
    }, POLL_MS);
    return () => {
      ended = true;
      clearInterval(timer);
    };
  }, [active, jobId, fail]);

  const attempt = async (work: () => Promise<void>) => {
    setError("");
    await work().catch(fail);
  };
  return { state, job, setJob, active, error, attempt, reload };
}
