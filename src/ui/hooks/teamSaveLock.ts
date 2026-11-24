import { useSyncExternalStore } from "react";

let saving = false;
const listeners = new Set<() => void>();

function setSaving(next: boolean): void {
  saving = next;
  listeners.forEach((listener) => {
    listener();
  });
}

export const isTeamSaving = () => saving;

export async function holdTeamSave(work: () => Promise<void>): Promise<void> {
  setSaving(true);
  try {
    await work();
  } finally {
    setSaving(false);
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function onTeamSaveSettled(settled: () => void): () => void {
  return subscribe(() => {
    if (!saving) settled();
  });
}

export function useTeamSaving(): boolean {
  return useSyncExternalStore(subscribe, isTeamSaving);
}
