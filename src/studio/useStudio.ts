import { useCallback, useEffect, useState } from "react";
import { fetchJob, fetchStudio, type StudioJob, type StudioState } from "../boundary/characterStudio";
import { errorText } from "../ui/errorText";

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
    });
    return () => {
      clearTimeout(timer);
    };
  }, [reload, fail]);

  useEffect(() => {
    if (!active || jobId === undefined) return;
    const timer = setInterval(() => {
      fetchJob(jobId).then(setJob).catch((cause: unknown) => {
        setJob(null);
        fail(cause);
      });
    }, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [active, jobId, fail]);

  const attempt = async (work: () => Promise<void>) => {
    setError("");
    await work().catch(fail);
  };
  return { state, job, setJob, active, error, attempt, reload };
}
