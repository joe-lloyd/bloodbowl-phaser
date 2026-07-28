/**
 * Scenario-case schema validation.
 *
 * These are the checks that keep the suite honest before a single game is
 * run: a duplicated id silently shadows a case, a missing seed makes a
 * "deterministic" variant random, an empty expectation set makes a case pass
 * by doing nothing, and a stale player ref fails deep inside the engine with
 * a message about nothing in particular. Catching them here names the case
 * and the field.
 */

import { GameConfig } from "../../config/GameConfig";
import {
  parsePlayerRef,
  referencesInCommand,
} from "../../game/rules-lab/references";
import { HeadlessCommand } from "../../headless/protocol";
import {
  EXECUTION_LAYERS,
  ExecutionLayer,
  ScenarioCase,
  SemanticStep,
} from "./types";

export interface ValidationIssue {
  caseId: string;
  /** Dotted path to the offending field, e.g. `variants[1].seed`. */
  field: string;
  message: string;
}

/**
 * Whether a step can be driven through a given layer. Section 4 supplies the
 * real browser predicate; validation takes it as an argument so this module
 * stays free of adapter imports (and so tests can probe both answers).
 */
export interface LayerSupport {
  supports(layer: ExecutionLayer, step: SemanticStep): boolean;
}

/** Every command type the protocol accepts, for the "invalid step" check. */
const KNOWN_COMMAND_TYPES = new Set<HeadlessCommand["type"]>([
  "coin-flip",
  "start-setup",
  "place-player",
  "remove-player",
  "swap-players",
  "apply-formation",
  "setup-concession",
  "confirm-setup",
  "select-kicker",
  "kick-ball",
  "kickoff-select-player",
  "kickoff-move-player",
  "kickoff-place-player",
  "kickoff-confirm",
  "kickoff-skip",
  "declare-action",
  "cancel-action",
  "move",
  "fumblerooski",
  "jump",
  "stand-up",
  "block",
  "multiple-block",
  "pass",
  "punt",
  "handoff",
  "foul",
  "stab",
  "throw-teammate",
  "throw-bomb",
  "ball-and-chain",
  "team-reroll-block",
  "pro-reroll-block",
  "brawler-reroll-block",
  "special-action",
  "end-activation",
  "end-turn",
  "award-mvp",
  "assign-awarded-touchdown",
  "choose-block-result",
  "choose-push-direction",
  "choose-follow-up",
  "use-reroll",
  "use-reaction",
  "choose-interception",
  "touchback",
  "state",
  "legal-actions",
]);

function onPitch(x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < GameConfig.PITCH_WIDTH &&
    y >= 0 &&
    y < GameConfig.PITCH_HEIGHT
  );
}

/**
 * Commands whose `x`/`y` are a *direction*, not a square. Ball & Chain takes
 * a unit vector for the Fanatic's facing, so (0,-1) is "north", not an
 * off-pitch square.
 */
const DIRECTION_COMMANDS = new Set<HeadlessCommand["type"]>(["ball-and-chain"]);

/** Squares a command names, so out-of-pitch targets fail up front. */
function squaresInCommand(command: HeadlessCommand): { x: number; y: number }[] {
  const record = command as unknown as Record<string, unknown>;
  const squares: { x: number; y: number }[] = [];
  if (
    !DIRECTION_COMMANDS.has(command.type) &&
    typeof record.x === "number" &&
    typeof record.y === "number"
  ) {
    squares.push({ x: record.x, y: record.y });
  }
  if (Array.isArray(record.path)) {
    for (const entry of record.path as { x: number; y: number }[]) {
      squares.push(entry);
    }
  }
  return squares;
}

/** Placement indices each side declares, i.e. the initially valid ref range. */
function placementIndices(scenarioCase: ScenarioCase) {
  return {
    team1: new Set(scenarioCase.setup.team1Placements.map((p) => p.playerIndex)),
    team2: new Set(scenarioCase.setup.team2Placements.map((p) => p.playerIndex)),
  };
}

/**
 * Commands whose whole purpose is to put a player on the pitch. A ref to an
 * unplaced player is exactly right for these, and the player counts as
 * placed for every step that follows.
 */
const PLACING_COMMANDS = new Set<HeadlessCommand["type"]>([
  "place-player",
  "apply-formation",
  "kickoff-place-player",
]);

function validateSteps(
  scenarioCase: ScenarioCase,
  support: LayerSupport | undefined,
  issues: ValidationIssue[]
): void {
  const placed = placementIndices(scenarioCase);
  const add = (field: string, message: string) =>
    issues.push({ caseId: scenarioCase.id, field, message });

  scenarioCase.steps.forEach((step, index) => {
    const where = `steps[${index}]`;
    const command = step.command;

    if (!command || typeof command.type !== "string") {
      add(where, "step has no protocol command");
      return;
    }
    if (!KNOWN_COMMAND_TYPES.has(command.type)) {
      add(`${where}.command.type`, `unknown protocol command '${command.type}'`);
    }
    if (command.type === "state" || command.type === "legal-actions") {
      add(
        `${where}.command.type`,
        `'${command.type}' is a query, not an interaction — assert it in a checkpoint instead`
      );
    }

    // Stale references: a ref may only name a player who is on the pitch by
    // the time the step runs — either placed by the setup, or placed by an
    // earlier step. Setup-driving cases legitimately start from an empty
    // board and place their own players.
    const placing = PLACING_COMMANDS.has(command.type);
    for (const ref of referencesInCommand(command)) {
      const parsed = parsePlayerRef(ref);
      if (!parsed) continue;
      if (placing) {
        placed[parsed.team].add(parsed.index);
        continue;
      }
      if (!placed[parsed.team].has(parsed.index)) {
        add(
          `${where}.command`,
          `ref '${ref}' names a player who is not on the pitch at this point ` +
            `(the setup does not place them, and no earlier step does either)`
        );
      }
    }

    for (const square of squaresInCommand(command)) {
      if (!onPitch(square.x, square.y)) {
        add(
          `${where}.command`,
          `square (${square.x},${square.y}) is outside the ${GameConfig.PITCH_WIDTH}x${GameConfig.PITCH_HEIGHT} pitch`
        );
      }
    }

    // A case that claims a layer must be drivable in it.
    if (support) {
      for (const layer of scenarioCase.layers) {
        if (!support.supports(layer, step)) {
          add(
            where,
            `case requires the '${layer}' layer but step '${step.intent ?? command.type}' ` +
              `has no ${layer} adapter`
          );
        }
      }
    }
  });
}

/** Validate one case in isolation (ids across cases are checked separately). */
export function validateScenarioCase(
  scenarioCase: ScenarioCase,
  support?: LayerSupport
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ caseId: scenarioCase.id, field, message });

  if (!/^[a-z0-9][a-z0-9-]*$/.test(scenarioCase.id)) {
    add("id", "case id must be lower-case kebab (stable, URL- and CLI-safe)");
  }
  if (!scenarioCase.capability.trim()) {
    add("capability", "case must declare a capability for the coverage report");
  }
  if (scenarioCase.interactions.length === 0) {
    add("interactions", "case must claim at least one inventory entry");
  }

  if (scenarioCase.layers.length === 0) {
    add("layers", "case must require at least one execution layer");
  }
  for (const layer of scenarioCase.layers) {
    if (!EXECUTION_LAYERS.includes(layer)) {
      add("layers", `unknown execution layer '${layer}'`);
    }
  }
  if (
    scenarioCase.layers.includes("visual") &&
    !scenarioCase.layers.includes("browser")
  ) {
    add("layers", "a visual case must also require the browser layer");
  }

  if (scenarioCase.variants.length === 0) {
    add("variants", "case must declare at least one seeded variant");
  }
  const variantIds = new Set<string>();
  scenarioCase.variants.forEach((variant, index) => {
    const where = `variants[${index}]`;
    if (variantIds.has(variant.id)) {
      add(`${where}.id`, `duplicate variant id '${variant.id}'`);
    }
    variantIds.add(variant.id);
    if (!Number.isFinite(variant.seed) || !Number.isInteger(variant.seed)) {
      add(
        `${where}.seed`,
        `variant '${variant.id}' has no committed integer seed — ` +
          `discover one with 'pnpm e2e:seeds'`
      );
    }
    if (!variant.expectedOutcome?.trim()) {
      add(
        `${where}.expectedOutcome`,
        `variant '${variant.id}' must say what its seed proves`
      );
    }
  });

  // An expectation-free case passes by doing nothing.
  const totalCheckpoints =
    scenarioCase.checkpoints.length +
    scenarioCase.variants.reduce(
      (sum, variant) => sum + (variant.checkpoints?.length ?? 0),
      0
    );
  if (totalCheckpoints === 0) {
    add("checkpoints", "case asserts nothing — add at least one checkpoint");
  }

  // …and so does a case whose checkpoints all skip the layer it requires.
  // Only worth saying when there ARE checkpoints; otherwise it just repeats
  // the message above once per layer.
  for (const layer of totalCheckpoints > 0 ? scenarioCase.layers : []) {
    if (layer === "visual") continue; // visual adds screenshots to browser cases
    const applies = [
      ...scenarioCase.checkpoints,
      ...scenarioCase.variants.flatMap((variant) => variant.checkpoints ?? []),
    ].some((checkpoint) => (checkpoint.layers ?? scenarioCase.layers).includes(layer));
    if (!applies) {
      add(
        "checkpoints",
        `case requires the '${layer}' layer but no checkpoint applies to it`
      );
    }
  }

  const checkpointIds = new Set<string>();
  for (const checkpoint of scenarioCase.checkpoints) {
    if (checkpointIds.has(checkpoint.id)) {
      add("checkpoints", `duplicate checkpoint id '${checkpoint.id}'`);
    }
    checkpointIds.add(checkpoint.id);
  }

  if (scenarioCase.regression) {
    if (!scenarioCase.regression.id.trim()) {
      add("regression.id", "regression case needs a stable id");
    }
    if (!scenarioCase.regression.summary.trim()) {
      add(
        "regression.summary",
        "regression case must record the original failure"
      );
    }
    if (
      scenarioCase.regression.uiBoundary &&
      !scenarioCase.layers.includes("browser")
    ) {
      add(
        "layers",
        `regression '${scenarioCase.regression.id}' is a UI-boundary defect, ` +
          `so the case must also require the 'browser' layer`
      );
    }
  }

  for (const grant of scenarioCase.syntheticGrants ?? []) {
    if (!grant.reason.trim()) {
      add(
        "syntheticGrants",
        `synthetic grant on ${grant.player} needs an isolation reason`
      );
    }
    const parsed = parsePlayerRef(grant.player);
    if (!parsed) {
      add("syntheticGrants", `'${grant.player}' is not a player reference`);
    }
  }

  validateSteps(scenarioCase, support, issues);
  return issues;
}

/** Validate a whole registry, including cross-case id uniqueness. */
export function validateScenarioCases(
  cases: ScenarioCase[],
  support?: LayerSupport
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenCaseIds = new Set<string>();
  const seenRegressionIds = new Map<string, string>();

  for (const scenarioCase of cases) {
    if (seenCaseIds.has(scenarioCase.id)) {
      issues.push({
        caseId: scenarioCase.id,
        field: "id",
        message: "duplicate case id — two cases cannot share an id",
      });
    }
    seenCaseIds.add(scenarioCase.id);

    const regressionId = scenarioCase.regression?.id;
    if (regressionId) {
      const owner = seenRegressionIds.get(regressionId);
      if (owner !== undefined) {
        issues.push({
          caseId: scenarioCase.id,
          field: "regression.id",
          message: `duplicate regression id '${regressionId}' — already on '${owner}'`,
        });
      } else {
        seenRegressionIds.set(regressionId, scenarioCase.id);
      }
    }

    issues.push(...validateScenarioCase(scenarioCase, support));
  }

  return issues;
}

/** Render issues as one readable block for a thrown error or a report. */
export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) => `  ${issue.caseId} · ${issue.field}: ${issue.message}`)
    .join("\n");
}

/** Throw when anything is wrong, naming every problem at once. */
export function assertValidScenarioCases(
  cases: ScenarioCase[],
  support?: LayerSupport
): void {
  const issues = validateScenarioCases(cases, support);
  if (issues.length > 0) {
    throw new Error(
      `${issues.length} scenario-case validation issue(s):\n${formatValidationIssues(issues)}`
    );
  }
}
