import { z } from "zod";
import { parseJson } from "./json";

const ROSTERS_KEY = "bloodbowl_offline_rosters";
const STALL_MS = 30_000;

const progressMessage = z.object({
  type: z.literal("progress"),
  id: z.number(),
  done: z.number(),
  total: z.number(),
});
const keptMessage = z.object({
  type: z.literal("kept"),
  id: z.number(),
  ready: z.array(z.string()),
  bytes: z.record(z.string(), z.number()),
  online: z.boolean(),
});
const workerMessage = z.discriminatedUnion("type", [progressMessage, keptMessage]);

const rosterList = z.array(z.string()).catch([]);

interface Progress {
  readonly done: number;
  readonly total: number;
}

export interface OfflineArt {
  readonly worker: boolean;
  readonly ready: ReadonlySet<string>;
  readonly bytes: Readonly<Record<string, number>>;
  readonly progress: Progress | null;
  readonly rosters: readonly string[];
  readonly reachable: boolean;
}

const store: {
  state: OfflineArt;
  wanted: string;
  sent: string;
  latestId: number;
  stallTimer: ReturnType<typeof setTimeout> | undefined;
} = {
  state: {
    worker: false,
    ready: new Set(),
    bytes: {},
    progress: null,
    rosters: readRosters(),
    reachable: true,
  },
  wanted: "",
  sent: "",
  latestId: 0,
  stallTimer: undefined,
};
const listeners = new Set<() => void>();

function readRosters(): string[] {
  try {
    const text = localStorage.getItem(ROSTERS_KEY);
    return text ? parseJson(text, rosterList) : [];
  } catch {
    return [];
  }
}

function update(next: Partial<OfflineArt>): void {
  store.state = { ...store.state, ...next };
  listeners.forEach((listener) => {
    listener();
  });
}

export function offlineArt(): OfflineArt {
  return store.state;
}

export function subscribeOfflineArt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function keepRosters(rosters: readonly string[]): void {
  const next = [...new Set([...store.state.rosters, ...rosters])];
  if (next.length === store.state.rosters.length) return;
  try {
    localStorage.setItem(ROSTERS_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  update({ rosters: next });
}

export function wantModels(models: readonly string[]): void {
  store.wanted = [...new Set(models)].sort((a, b) => a.localeCompare(b)).join(",");
  if (store.wanted !== store.sent) send();
}

function send(): void {
  if (!store.state.worker) return;
  store.sent = store.wanted;
  store.latestId += 1;
  const models = store.wanted ? store.wanted.split(",") : [];
  const message = { type: "keep", id: store.latestId, models };
  watchForStall();
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage(message);
  });
}

function watchForStall(): void {
  clearTimeout(store.stallTimer);
  store.stallTimer = setTimeout(send, STALL_MS);
}

function onWorkerMessage(event: MessageEvent): void {
  const parsed = workerMessage.safeParse(event.data);
  if (!parsed.success || parsed.data.id !== store.latestId) return;
  const message = parsed.data;
  if (message.type === "progress") {
    watchForStall();
    update({ progress: { done: message.done, total: message.total } });
    return;
  }
  clearTimeout(store.stallTimer);
  update({
    ready: new Set(message.ready),
    bytes: message.bytes,
    progress: null,
    reachable: message.online,
  });
}

export function startOfflineArt(): void {
  navigator.serviceWorker.addEventListener("message", onWorkerMessage);
  addEventListener("online", send);
  addEventListener("offline", send);
  update({ worker: true });
  send();
}
