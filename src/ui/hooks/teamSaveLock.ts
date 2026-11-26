import { useSyncExternalStore } from "react";

const saveState = { saving: false };
const listeners = new Set<() => void>();

function setSaving(next: boolean): void {
  saveState.saving = next;
  listeners.forEach((listener) => {
    listener();
  });
}

export const isTeamSaving = () => saveState.saving;

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
    if (!saveState.saving) settled();
  });
}

export function useTeamSaving(): boolean {
  return useSyncExternalStore(subscribe, isTeamSaving);
}
