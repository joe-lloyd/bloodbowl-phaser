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

export function useTeamSaving(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, isTeamSaving);
}
