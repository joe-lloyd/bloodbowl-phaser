import { GameConfig } from "../../config/GameConfig";
import {
  parsePlayerRef,
  referencesInCommand,
} from "../../game/rules-lab/references";
import { type HeadlessCommand } from "../../headless/protocol";
import {
  EXECUTION_LAYERS,
  type ExecutionLayer,
  type ScenarioCase,
  type SemanticStep,
} from "./types";

export interface ValidationIssue {
  caseId: string;

  field: string;
  message: string;
}

export interface LayerSupport {
  supports(layer: ExecutionLayer, step: SemanticStep): boolean;
}

const KNOWN_COMMAND_TYPES = new Set<HeadlessCommand["type"]>([
  "coin-flip",
  "ready-weather",
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
  "kickoff-reselect",
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
  "veteran-reroll-block",
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
    Number.isSafeInteger(x) &&
    Number.isSafeInteger(y) &&
    x >= 0 &&
    x < GameConfig.PITCH_WIDTH &&
    y >= 0 &&
    y < GameConfig.PITCH_HEIGHT
  );
}

const DIRECTION_COMMANDS = new Set<HeadlessCommand["type"]>(["ball-and-chain"]);

function squaresInCommand(
  command: HeadlessCommand
): { x: number; y: number }[] {
  const record = command as unknown as Record<string, unknown>;
  const squares: { x: number; y: number }[] = [];
  if (
    !DIRECTION_COMMANDS.has(command.type) &&
    typeof record["x"] === "number" &&
    typeof record["y"] === "number"
  ) {
    squares.push({ x: record["x"], y: record["y"] });
  }
  const path = record["path"];
  if (Array.isArray(path)) {
    for (const entry of path) {
      squares.push(entry);
    }
  }
  return squares;
}

function placementIndices(scenarioCase: ScenarioCase) {
  return {
    team1: new Set(
      scenarioCase.setup.team1Placements.map((p) => p.playerIndex)
    ),
    team2: new Set(
      scenarioCase.setup.team2Placements.map((p) => p.playerIndex)
    ),
  };
}

const PLACING_COMMANDS = new Set<HeadlessCommand["type"]>([
  "place-player",
  "apply-formation",
  "kickoff-place-player",
]);

type Add = (field: string, message: string) => void;

function checkRefs(
  command: HeadlessCommand,
  placed: ReturnType<typeof placementIndices>,
  where: string,
  add: Add
): void {
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
}

function checkStepLayers(
  scenarioCase: ScenarioCase,
  step: ScenarioCase["steps"][number],
  support: LayerSupport,
  where: string,
  add: Add
): void {
  for (const layer of scenarioCase.layers) {
    if (!support.supports(layer, step)) {
      add(
        where,
        `case requires the '${layer}' layer but step '${step.intent ?? step.command.type}' ` +
          `has no ${layer} adapter`
      );
    }
  }
}

function validateSteps(
  scenarioCase: ScenarioCase,
  support: LayerSupport | undefined,
  issues: ValidationIssue[]
): void {
  const placed = placementIndices(scenarioCase);
  const add = (field: string, message: string) => {
    issues.push({ caseId: scenarioCase.id, field, message });
  };

  for (const [index, step] of scenarioCase.steps.entries()) {
    const where = `steps[${String(index)}]`;
    const command = step.command;

    if (!command || typeof command.type !== "string") {
      add(where, "step has no protocol command");
      continue;
    }
    if (!KNOWN_COMMAND_TYPES.has(command.type)) {
      add(
        `${where}.command.type`,
        `unknown protocol command '${command.type}'`
      );
    }
    if (command.type === "state" || command.type === "legal-actions") {
      add(
        `${where}.command.type`,
        `'${command.type}' is a query, not an interaction — assert it in a checkpoint instead`
      );
    }

    checkRefs(command, placed, where, add);

    for (const square of squaresInCommand(command)) {
      if (!onPitch(square.x, square.y)) {
        add(
          `${where}.command`,
          `square (${String(square.x)},${String(square.y)}) is outside the ${String(GameConfig.PITCH_WIDTH)}x${String(GameConfig.PITCH_HEIGHT)} pitch`
        );
      }
    }

    if (support) checkStepLayers(scenarioCase, step, support, where, add);
  }
}

function checkLayers(scenarioCase: ScenarioCase, add: Add): void {
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
}

function checkVariants(scenarioCase: ScenarioCase, add: Add): void {
  if (scenarioCase.variants.length === 0) {
    add("variants", "case must declare at least one seeded variant");
  }
  const variantIds = new Set<string>();
  for (const [index, variant] of scenarioCase.variants.entries()) {
    const where = `variants[${String(index)}]`;
    if (variantIds.has(variant.id)) {
      add(`${where}.id`, `duplicate variant id '${variant.id}'`);
    }
    variantIds.add(variant.id);
    if (!Number.isFinite(variant.seed) || !Number.isSafeInteger(variant.seed)) {
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
  }
}

function checkCheckpoints(scenarioCase: ScenarioCase, add: Add): void {
  const totalCheckpoints =
    scenarioCase.checkpoints.length +
    scenarioCase.variants.reduce(
      (sum, variant) => sum + (variant.checkpoints?.length ?? 0),
      0
    );
  if (totalCheckpoints === 0) {
    add("checkpoints", "case asserts nothing — add at least one checkpoint");
  }

  const checkedLayers = totalCheckpoints > 0 ? scenarioCase.layers : [];
  for (const layer of checkedLayers) {
    if (layer === "visual") continue;
    const applies = [
      ...scenarioCase.checkpoints,
      ...scenarioCase.variants.flatMap((variant) => variant.checkpoints ?? []),
    ].some((checkpoint) =>
      (checkpoint.layers ?? scenarioCase.layers).includes(layer)
    );
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
}

function checkRegression(scenarioCase: ScenarioCase, add: Add): void {
  const regression = scenarioCase.regression;
  if (!regression) return;
  if (!regression.id.trim()) {
    add("regression.id", "regression case needs a stable id");
  }
  if (!regression.summary.trim()) {
    add(
      "regression.summary",
      "regression case must record the original failure"
    );
  }
  if (regression.uiBoundary && !scenarioCase.layers.includes("browser")) {
    add(
      "layers",
      `regression '${regression.id}' is a UI-boundary defect, ` +
        `so the case must also require the 'browser' layer`
    );
  }
}

function checkSyntheticGrants(scenarioCase: ScenarioCase, add: Add): void {
  const grants = scenarioCase.syntheticGrants ?? [];
  for (const grant of grants) {
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
}

export function validateScenarioCase(
  scenarioCase: ScenarioCase,
  support?: LayerSupport
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) => {
    issues.push({ caseId: scenarioCase.id, field, message });
  };

  if (!/^[a-z0-9][a-z0-9-]*$/.test(scenarioCase.id)) {
    add("id", "case id must be lower-case kebab (stable, URL- and CLI-safe)");
  }
  if (!scenarioCase.capability.trim()) {
    add("capability", "case must declare a capability for the coverage report");
  }
  if (scenarioCase.interactions.length === 0) {
    add("interactions", "case must claim at least one inventory entry");
  }

  checkLayers(scenarioCase, add);
  checkVariants(scenarioCase, add);
  checkCheckpoints(scenarioCase, add);
  checkRegression(scenarioCase, add);
  checkSyntheticGrants(scenarioCase, add);
  validateSteps(scenarioCase, support, issues);
  return issues;
}

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
      if (owner === undefined) {
        seenRegressionIds.set(regressionId, scenarioCase.id);
      } else {
        issues.push({
          caseId: scenarioCase.id,
          field: "regression.id",
          message: `duplicate regression id '${regressionId}' — already on '${owner}'`,
        });
      }
    }

    issues.push(...validateScenarioCase(scenarioCase, support));
  }

  return issues;
}

function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) => `  ${issue.caseId} · ${issue.field}: ${issue.message}`)
    .join("\n");
}

export function assertValidScenarioCases(
  cases: ScenarioCase[],
  support?: LayerSupport
): void {
  const issues = validateScenarioCases(cases, support);
  if (issues.length > 0) {
    throw new Error(
      `${String(issues.length)} scenario-case validation issue(s):\n${formatValidationIssues(issues)}`
    );
  }
}
