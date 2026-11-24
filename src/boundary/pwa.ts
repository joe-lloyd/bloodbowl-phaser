const INSTALLED_QUERY = "(display-mode: fullscreen), (display-mode: standalone)";

interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

function startedInstalled(): boolean {
  if (typeof window === "undefined" || typeof matchMedia !== "function")
    return false;
  if ("standalone" in navigator && navigator.standalone === true) return true;
  return !document.fullscreenElement && matchMedia(INSTALLED_QUERY).matches;
}

export const runsInstalled = startedInstalled();

export function installsByHand(): boolean {
  return !runsInstalled && "standalone" in navigator;
}

let offer: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function setOffer(next: InstallPromptEvent | null): void {
  offer = next;
  listeners.forEach((listener) => {
    listener();
  });
}

function isInstallPrompt(event: Event): event is InstallPromptEvent {
  return "prompt" in event && typeof event.prompt === "function";
}

export function subscribeInstallOffer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function canInstall(): boolean {
  return offer !== null;
}

export async function install(): Promise<void> {
  const pending = offer;
  setOffer(null);
  await pending?.prompt();
}

export function startPwa(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    if (!isInstallPrompt(event)) return;
    event.preventDefault();
    setOffer(event);
  });
  window.addEventListener("appinstalled", () => {
    setOffer(null);
  });
  if (import.meta.env.MODE !== "production" || !("serviceWorker" in navigator))
    return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch((error: unknown) => {
        console.warn("[PWA] service worker did not register", error);
      });
  });
}
