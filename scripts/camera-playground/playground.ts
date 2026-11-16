import { pixelToGrid } from "../../src/game/elements/GridUtils";
import {
  centre,
  frame,
  newPlayers,
  otherTeam,
  pitchCorners,
  policies,
  scenarios,
  teamName,
  world,
  type Area,
  type Camera,
  type Player,
  type Policy,
  type Team,
} from "./model";
import { project, Renderer } from "./render";
import { element, input } from "./dom";
import { setupFeedback } from "./feedback";

const canvas = element("pitch");
const scenarioSelect = element("scenario");
if (
  !(canvas instanceof HTMLCanvasElement) ||
  !(scenarioSelect instanceof HTMLSelectElement)
)
  throw new Error("Invalid playground markup");
const renderer = new Renderer(canvas);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let scenario = scenarios[0];
if (!scenario) throw new Error("No camera scenarios");
let players = newPlayers(scenario);
let policy: Policy = "team";
let activeTeam: Team = "home";
let selected: string | null = "home-1";
let turn = 1;
let tray = false;
let camera: Camera = { ...world({ x: 9.5, y: 5 }), zoom: 0.6 };
let renderedArea: Area = { left: 16, top: 100, right: 900, bottom: 500 };
let layoutTween: { from: Area; to: Area; start: number } | null = null;
let tween: {
  from: Camera;
  to: Camera;
  start: number;
  duration: number;
  complete: () => void;
} | null = null;
let phase:
  | "idle"
  | "opening"
  | "handoff-wide"
  | "handoff-pause"
  | "handoff-team" = "idle";
let pauseUntil = 0;
let reason = "Opening";
let trigger = "opening";
let activationZoom: number | null = null;
let moving: {
  player: Player;
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  duration: number;
} | null = null;
let blockAnimation: { id: string; start: number } | null = null;
let lastMetrics = 0;
let ready = false;
const events: {
  event: string;
  zoom: number;
  team: Team;
  player: string | null;
  at: number;
}[] = [];

function measureArea(): Area {
  const board = canvas.getBoundingClientRect();
  const score = element("scoreboard").getBoundingClientRect();
  const dice = element("dice-tray").getBoundingClientRect();
  // Convert each DOM axis independently into the renderer's logical canvas units.
  const sx = canvas.clientWidth / board.width;
  const sy = canvas.clientHeight / board.height;
  return {
    left: 16 * sx,
    right: canvas.clientWidth - 16 * sx,
    top: (score.bottom - board.top + 12) * sy,
    bottom: tray
      ? (dice.top - board.top - 12) * sy
      : canvas.clientHeight - 16 * sy,
  };
}
function overview(): Camera {
  return frame(pitchCorners, measureArea(), 1.1);
}
function actionZoom(): number {
  return canvas.clientWidth < 600 ? 0.95 : 1.05;
}
function eligible() {
  return players.filter((p) => p.team === activeTeam && !p.spent);
}
function activePlayer() {
  return players.find((p) => p.id === selected);
}
function settleMovement() {
  if (moving) {
    moving.player.x = moving.to.x;
    moving.player.y = moving.to.y;
    moving = null;
  }
}
function record(event: string) {
  events.push({
    event,
    zoom: camera.zoom,
    team: activeTeam,
    player: selected,
    at: Math.round(performance.now()),
  });
  if (events.length > 100) events.shift();
}
function changeReason(message: string, source: string) {
  reason = message;
  trigger = source;
  record(source);
}
function stopMotion() {
  tween = null;
  phase = "idle";
  pauseUntil = 0;
}
function animate(
  to: Camera,
  duration: number,
  complete: () => void = () => {}
) {
  tween = {
    from: { ...camera },
    to,
    start: performance.now(),
    duration: reducedMotion ? 1 : duration,
    complete,
  };
}
function panToPlayer(player: Player, message: string, source: string) {
  stopMotion();
  const pos = world(player);
  animate({ x: pos.x, y: pos.y - 22, zoom: camera.zoom }, 420);
  changeReason(message, source);
}
function setTray(open: boolean) {
  tray = open;
  element("dice-tray").hidden = !open;
  element("tray").textContent = open ? "Close tray" : "Open tray";
  element("tray").setAttribute("aria-pressed", String(open));
  layoutTween = {
    from: { ...renderedArea },
    to: measureArea(),
    start: performance.now(),
  };
}
function selectPlayer(player: Player) {
  if (player.team !== activeTeam || player.spent || phase.startsWith("handoff"))
    return;
  selected = player.id;
  activationZoom = camera.zoom;
  panToPlayer(
    player,
    `Selected #${player.number}. Tracking pan; zoom held.`,
    "select"
  );
  updateUI();
}
function teamTarget(allowZoom: boolean): Camera {
  const remaining = eligible();
  const to = frame(
    remaining.length ? remaining : players.filter((p) => p.team === activeTeam),
    measureArea(),
    actionZoom()
  );
  return { ...to, zoom: allowZoom ? to.zoom : camera.zoom };
}
function endActivation() {
  const player = activePlayer();
  if (!player || phase.startsWith("handoff")) return;
  stopMotion();
  settleMovement();
  player.spent = true;
  selected = null;
  activationZoom = null;
  setTray(false);
  const remaining = eligible();
  if (remaining.length) {
    animate(teamTarget(policy === "team"), 420);
    changeReason(
      policy === "team"
        ? `#${player.number} done. Framing ${remaining.length} eligible teammates.`
        : `#${player.number} done. Panning to ${remaining.length} teammates; zoom held.`,
      "end-activation"
    );
  } else {
    changeReason(
      "All players have acted. End the team turn to hand over.",
      "all-acted"
    );
  }
  updateUI();
}
function finishHandoff() {
  activeTeam = otherTeam(activeTeam);
  if (activeTeam === "home") turn += 1;
  players
    .filter((p) => p.team === activeTeam)
    .forEach((p) => {
      p.spent = false;
    });
  phase = "handoff-team";
  animate(teamTarget(policy !== "overview"), 650, () => {
    phase = "idle";
    updateUI();
    record("handoff-complete");
  });
  changeReason(
    `${teamName(activeTeam)} to act. ${policy === "overview" ? "Team pan; zoom held." : "Framing the new active team."}`,
    "turn-team"
  );
  updateUI();
}
function endTurn() {
  if (phase.startsWith("handoff")) return;
  stopMotion();
  settleMovement();
  selected = null;
  activationZoom = null;
  setTray(false);
  if (policy === "overview") {
    finishHandoff();
  } else {
    phase = "handoff-wide";
    const all = frame(players, measureArea(), actionZoom());
    animate({ ...all, zoom: Math.min(camera.zoom, all.zoom) }, 650, () => {
      phase = "handoff-pause";
      pauseUntil = performance.now() + (reducedMotion ? 150 : 600);
      changeReason(
        "All players in view. Brief pause before the other team.",
        "turn-overview-pause"
      );
      updateUI();
    });
    changeReason(
      "Team turn ended. Widening to show all 14 players.",
      "turn-overview"
    );
  }
  updateUI();
}
function moveTo(to: { x: number; y: number }) {
  settleMovement();
  const player = activePlayer();
  if (!player || phase.startsWith("handoff") || player.spent) return;
  if (to.x < 0 || to.x > 19 || to.y < 0 || to.y > 10) return;
  if (
    players.some(
      (p) =>
        p.id !== player.id &&
        Math.round(p.x) === to.x &&
        Math.round(p.y) === to.y
    )
  ) {
    changeReason("That square is occupied. Choose empty pitch.", "occupied");
    return;
  }
  moving = {
    player,
    from: { x: player.x, y: player.y },
    to,
    start: performance.now(),
    duration: reducedMotion ? 1 : 700,
  };
  panToPlayer(
    { ...player, ...to },
    `#${player.number} moving. Tracking pan; zoom held.`,
    "move"
  );
  updateUI();
}
function moveThree() {
  const player = activePlayer();
  if (!player) return;
  const direction = player.x > 16 ? -1 : 1;
  const candidates = [0, -1, 1, -2, 2].map((dy) => ({
    x: Math.round(player.x) + direction * 3,
    y: Math.max(0, Math.min(10, Math.round(player.y) + dy)),
  }));
  const target = candidates.find(
    (to) =>
      !players.some((p) => p.id !== player.id && p.x === to.x && p.y === to.y)
  );
  if (target) moveTo(target);
}
function block() {
  settleMovement();
  const player = activePlayer();
  if (!player) return;
  blockAnimation = { id: player.id, start: performance.now() };
  setTray(true);
  panToPlayer(
    player,
    `#${player.number} blocking. Tray open; zoom held.`,
    "block"
  );
  updateUI();
}
function manualZoom(factor: number) {
  if (phase.startsWith("handoff")) return;
  stopMotion();
  camera.zoom = Math.max(0.12, Math.min(2, camera.zoom * factor));
  activationZoom = selected ? camera.zoom : null;
  changeReason(
    "Manual zoom. This scale holds until an explicit camera transition.",
    "manual-zoom"
  );
  updateUI();
}
function replayOpening() {
  stopMotion();
  moving = null;
  selected = null;
  activationZoom = null;
  setTray(false);
  renderedArea = measureArea();
  layoutTween = null;
  const wide = overview();
  camera = { ...wide, zoom: wide.zoom * 0.72 };
  phase = "opening";
  animate(
    {
      ...wide,
      zoom:
        policy === "overview"
          ? wide.zoom
          : Math.min(actionZoom(), wide.zoom * 1.6),
    },
    1250,
    () => {
      phase = "idle";
      changeReason(
        "Opening complete. Choose a teammate; zoom holds during play.",
        "opening-complete"
      );
      updateUI();
    }
  );
  changeReason(
    "Opening. One steady zoom with the world centre held still.",
    "opening"
  );
  updateUI();
}
function resetScenario() {
  stopMotion();
  moving = null;
  blockAnimation = null;
  players = newPlayers(scenario);
  activeTeam = "home";
  turn = 1;
  selected = "home-1";
  setTray(scenario.tray);
  renderedArea = measureArea();
  layoutTween = null;
  const first = activePlayer();
  if (first) {
    const p = world(first);
    camera = {
      x: p.x,
      y: p.y - 22,
      zoom: policy === "overview" ? overview().zoom : actionZoom(),
    };
  }
  activationZoom = camera.zoom;
  changeReason(
    `${scenario.title} reset. #1 selected; zoom held.`,
    "scenario-reset"
  );
  updateUI();
}

function updatePlayerControls(locked: boolean) {
  const player = activePlayer();
  element("player-bug").replaceChildren();
  element("player-bug").append(
    player ? `#${player.number} ${teamName(player.team)}` : "Choose a teammate"
  );
  const sub = document.createElement("small");
  sub.textContent = player
    ? `${Math.round(player.x)}, ${Math.round(player.y)} · activation`
    : `${eligible().length} eligible to act`;
  element("player-bug").append(sub);
  for (const id of ["move", "block", "end-activation"]) {
    const button = element(id);
    if (button instanceof HTMLButtonElement)
      button.disabled = !ready || locked || !player;
  }
  for (const id of ["end-turn", "tray", "zoom-in", "zoom-out"]) {
    const button = element(id);
    if (button instanceof HTMLButtonElement) button.disabled = !ready || locked;
  }
}
function updateUI() {
  element("reason").textContent = reason;
  element("metric-trigger").textContent = trigger;
  element("turn-tab").textContent =
    `${teamName(activeTeam)} to act · Turn ${turn}`;
  element("roster-title").textContent = `${teamName(activeTeam)} players`;
  element("eligible-count").textContent = `${eligible().length} eligible`;
  element("dice-team").textContent = teamName(activeTeam);
  element("dice-tray").style.borderTopColor =
    activeTeam === "home" ? "#467cd4" : "#c44a3d";
  element("scenario-copy").textContent = scenario.copy;
  element("note-context").textContent =
    `${policies.find((p) => p.id === policy)?.title} · ${scenario.title} · ${teamName(activeTeam)} · ${selected ?? "choosing next player"}`;
  const locked = phase.startsWith("handoff");
  updatePlayerControls(locked);
  element("transition-label").hidden = phase === "idle";
  element("transition-label").textContent =
    phase === "opening"
      ? "Opening · steady zoom"
      : phase === "handoff-wide"
        ? "1 / 3 · Show all players"
        : phase === "handoff-pause"
          ? "2 / 3 · Read the pitch"
          : "3 / 3 · Next team";
  element("roster").replaceChildren(
    ...players
      .filter((p) => p.team === activeTeam)
      .map((p) => {
        const button = document.createElement("button");
        button.textContent = `#${p.number}`;
        button.setAttribute(
          "aria-label",
          `Select ${teamName(p.team)} player ${p.number}${p.spent ? ", already acted" : ""}`
        );
        button.setAttribute("aria-pressed", String(p.id === selected));
        button.disabled = p.spent || locked || !ready;
        const detail = document.createElement("small");
        detail.textContent = p.spent
          ? "Done"
          : `${Math.round(p.x)},${Math.round(p.y)}`;
        button.append(detail);
        button.onclick = () => selectPlayer(p);
        return button;
      })
  );
  document
    .querySelectorAll<HTMLButtonElement>(".policy")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.policy === policy))
    );
  const description = element("policy-summary");
  description.textContent = policies.find((p) => p.id === policy)?.copy ?? "";
}
function metrics() {
  element("zoom-value").textContent = `${camera.zoom.toFixed(2)}×`;
  element("metric-zoom").textContent = `${camera.zoom.toFixed(4)}×`;
  const delta = activationZoom === null ? null : camera.zoom - activationZoom;
  element("metric-delta").textContent =
    delta === null ? "No activation" : `${delta.toFixed(6)}×`;
  const area = measureArea();
  element("metric-area").textContent =
    `${Math.round(area.right - area.left)} × ${Math.round(area.bottom - area.top)}`;
  element("zoom-lock").textContent =
    phase !== "idle"
      ? "Camera transition"
      : delta !== null && Math.abs(delta) > 0.000001
        ? "Zoom changed"
        : "Zoom held";
}
function tick(time: number) {
  if (layoutTween) {
    const t = Math.min(
      1,
      (time - layoutTween.start) / (reducedMotion ? 1 : 300)
    );
    const lerp = (a: number, b: number) => a + (b - a) * (t * t * (3 - 2 * t));
    const { from, to } = layoutTween;
    renderedArea = {
      left: lerp(from.left, to.left),
      top: lerp(from.top, to.top),
      right: lerp(from.right, to.right),
      bottom: lerp(from.bottom, to.bottom),
    };
    if (t === 1) layoutTween = null;
  }
  if (moving) {
    const t = Math.min(1, (time - moving.start) / moving.duration);
    moving.player.x = moving.from.x + (moving.to.x - moving.from.x) * t;
    moving.player.y = moving.from.y + (moving.to.y - moving.from.y) * t;
    if (t === 1) {
      moving = null;
      record("move-complete");
      updateUI();
    }
  }
  if (tween) {
    const t = Math.min(1, (time - tween.start) / tween.duration);
    const eased = t * t * (3 - 2 * t);
    const { from, to, complete } = tween;
    camera = {
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased,
      zoom: from.zoom + (to.zoom - from.zoom) * eased,
    };
    if (t === 1) {
      tween = null;
      complete();
    }
  }
  if (phase === "handoff-pause" && time >= pauseUntil) finishHandoff();
  renderer.draw({
    camera,
    area: renderedArea,
    players,
    selected,
    animation: blockAnimation,
    moving: moving?.player.id ?? null,
    guides: input("guides").checked,
    time,
  });
  if (time - lastMetrics > 80) {
    metrics();
    lastMetrics = time;
  }
  requestAnimationFrame(tick);
}

for (const choice of policies) {
  const button = document.createElement("button");
  button.className = "policy";
  button.dataset.policy = choice.id;
  const title = document.createElement("b");
  title.textContent = choice.title;
  const copy = document.createElement("span");
  copy.textContent = choice.copy;
  button.append(title, copy);
  button.onclick = () => {
    policy = choice.id;
    resetScenario();
  };
  element("policies").append(button);
}
for (const choice of scenarios) {
  const option = document.createElement("option");
  option.value = choice.id;
  option.textContent = choice.title;
  scenarioSelect.append(option);
}
scenarioSelect.onchange = () => {
  const choice = scenarios.find((s) => s.id === scenarioSelect.value);
  if (choice) {
    scenario = choice;
    resetScenario();
  }
};
element("reset").onclick = resetScenario;
element("replay").onclick = replayOpening;
element("move").onclick = moveThree;
element("block").onclick = block;
element("tray").onclick = () => {
  setTray(!tray);
  changeReason(
    `Dice tray ${tray ? "opened" : "closed"}. Centre adjusted; zoom held.`,
    "tray"
  );
  updateUI();
};
function closeTray() {
  setTray(false);
  changeReason("Dice tray closed. Centre adjusted; zoom held.", "tray-close");
  updateUI();
}
element("close-tray").onclick = closeTray;
document.querySelectorAll<HTMLButtonElement>(".die").forEach((b) => {
  b.onclick = closeTray;
});
element("end-activation").onclick = endActivation;
element("end-turn").onclick = endTurn;
element("zoom-in").onclick = () => manualZoom(1.15);
element("zoom-out").onclick = () => manualZoom(1 / 1.15);
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    manualZoom(Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * 0.001));
  },
  { passive: false }
);
let drag: {
  pointerId: number;
  startX: number;
  startY: number;
  camera: Camera;
  moved: boolean;
} | null = null;
canvas.addEventListener("pointerdown", (event) => {
  if (phase.startsWith("handoff")) return;
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    camera: { ...camera },
    moved: false,
  };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const dx = event.clientX - drag.startX,
    dy = event.clientY - drag.startY;
  if (Math.hypot(dx, dy) > 5) drag.moved = true;
  if (!drag.moved) return;
  stopMotion();
  camera = {
    x: drag.camera.x - dx / camera.zoom,
    y: drag.camera.y - dy / camera.zoom,
    zoom: camera.zoom,
  };
  changeReason(
    "Manual pan; zoom held. Select a teammate to resume tracking.",
    "manual-pan"
  );
});
canvas.addEventListener("pointerup", (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const moved = drag.moved;
  drag = null;
  if (moved) {
    updateUI();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const hit = players
    .filter((p) => p.team === activeTeam && !p.spent)
    .map((p) => ({
      player: p,
      point: project({ ...world(p), y: world(p).y - 20 }, camera, renderedArea),
    }))
    .sort(
      (a, b) =>
        Math.hypot(a.point.x - point.x, a.point.y - point.y) -
        Math.hypot(b.point.x - point.x, b.point.y - point.y)
    )[0];
  if (
    hit &&
    Math.hypot(hit.point.x - point.x, hit.point.y - point.y) <
      Math.max(20, 30 * camera.zoom)
  ) {
    selectPlayer(hit.player);
    return;
  }
  const c = centre(renderedArea);
  const w = {
    x: camera.x + (point.x - c.x) / camera.zoom - 1351.145,
    y: camera.y + (point.y - c.y) / camera.zoom - 1115.12,
  };
  moveTo(pixelToGrid(w.x, w.y));
});
canvas.addEventListener("pointercancel", () => {
  drag = null;
});
new ResizeObserver(() => {
  renderedArea = measureArea();
  layoutTween = null;
  if (ready)
    changeReason(
      "Viewport resized. Zoom held; usable view measured again.",
      "resize"
    );
}).observe(element("stage"));

setupFeedback(() => ({
  context: element("note-context").textContent ?? "",
  zoom: camera.zoom.toFixed(4),
  trigger,
}));

// Read-only measurements for browser checks. All interactions use the visible controls.
Object.defineProperty(window, "cameraPlayground", {
  value: {
    snapshot: () => ({
      ready,
      policy,
      scenario: scenario.id,
      phase,
      activeTeam,
      selected,
      turn,
      tray,
      zoom: camera.zoom,
      camera: { ...camera },
      area: measureArea(),
      renderedArea: { ...renderedArea },
      centre: centre(measureArea()),
      activationZoom,
      reason,
      trigger,
      moving: moving !== null,
      animating: tween !== null || layoutTween !== null,
      players: players.map((p) => ({
        ...p,
        screen: project(world(p), camera, renderedArea),
      })),
      events: [...events],
    }),
  },
});

renderer
  .load()
  .then(() => {
    ready = true;
    element("loading").hidden = true;
    renderedArea = measureArea();
    replayOpening();
    requestAnimationFrame(tick);
  })
  .catch((error) => {
    element("loading").textContent =
      `The stadium could not load. ${error instanceof Error ? error.message : "Reload the page to retry."}`;
  });
