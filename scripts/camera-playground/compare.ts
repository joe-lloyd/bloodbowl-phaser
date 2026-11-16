import { element } from "./dom";

const views = [
  { id: "compare-a", policy: "team" },
  { id: "compare-b", policy: "keep" },
].map(({ id, policy }) => {
  const frame = element(id);
  if (!(frame instanceof HTMLIFrameElement))
    throw new Error(`Expected comparison frame ${id}`);
  return { frame, policy };
});
let timer: ReturnType<typeof setTimeout> | null = null;

function reset() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  for (const { frame, policy } of views) {
    const doc = frame.contentDocument;
    if (!doc) throw new Error("The camera view has not loaded");
    // Drive the same controls as the full playground, with identical staging.
    doc.querySelector<HTMLButtonElement>(`[data-policy="${policy}"]`)?.click();
    const scenario = doc.querySelector<HTMLSelectElement>("select#scenario");
    if (!scenario) throw new Error("Missing camera scenario control");
    scenario.value = "spread";
    scenario.dispatchEvent(new Event("change"));
  }
  element("compare-status").textContent =
    "Before: same player, same zoom. Neither camera has reset yet.";
}

function play() {
  reset();
  timer = setTimeout(() => {
    timer = null;
    for (const { frame } of views)
      frame.contentDocument?.getElementById("end-activation")?.click();
    element("compare-status").textContent =
      "End activation clicked in both. A zooms out; B keeps the same scale.";
  }, 1000);
}

element("compare-play").onclick = play;
element("compare-reset").onclick = reset;

async function prepare() {
  // An iframe load can finish before the stadium's image decoding does.
  const deadline = performance.now() + 20_000;
  await new Promise<void>((resolve, reject) => {
    const check = () => {
      const loaded = views.every(
        ({ frame }) => frame.contentDocument?.getElementById("loading")?.hidden
      );
      if (loaded) return resolve();
      if (performance.now() > deadline)
        return reject(new Error("The stadium did not load. Reload to retry."));
      requestAnimationFrame(check);
    };
    check();
  });
  for (const { frame } of views)
    frame.contentDocument?.documentElement.setAttribute("data-comparison", "");
  for (const id of ["compare-play", "compare-reset"]) {
    const button = element(id);
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
  play();
}

void prepare().catch((error: unknown) => {
  element("compare-status").textContent =
    error instanceof Error ? error.message : "Reload to retry the comparison.";
});
