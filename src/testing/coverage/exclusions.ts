/**
 * Reviewed coverage exclusions.
 *
 * A gap that nobody intends to close is still a gap, and hiding it makes the
 * report a lie. An exclusion is therefore a written decision: what is
 * excluded, why, who owns it, and where the follow-up is tracked. Coverage
 * validation rejects an exclusion missing any of that, so "excluded" can
 * never quietly mean "forgotten".
 *
 * Exclusions live here, in one file, rather than beside each scenario family:
 * the whole point is that they are reviewable together.
 */

import { ExecutionLayer } from "../scenarioCase/types";

export interface CoverageExclusion {
  /** The inventory entry id this excuses. */
  entryId: string;
  /** Which layers are excused; omit to excuse the entry entirely. */
  layers?: ExecutionLayer[];
  /** Why this is not covered. Required, and read by humans. */
  reason: string;
  /** Who decided. A name or a team, not "we". */
  owner: string;
  /** Issue, change id, or task reference where the follow-up lives. */
  tracking: string;
}

export const COVERAGE_EXCLUSIONS: CoverageExclusion[] = [
  {
    entryId: "protocol-command:award-mvp",
    reason:
      "Post-match league progression runs after GAME_OVER and has no in-drive " +
      "scenario to attach to; it is covered by the progression unit tests " +
      "(__tests__/unit/seeding, PostMatchProgression) rather than a scenario case.",
    owner: "bloodbowl-phaser maintainers",
    tracking: "openspec/changes/add-comprehensive-e2e-scenario-testing",
  },
  {
    entryId: "protocol-command:assign-awarded-touchdown",
    reason:
      "Same post-match progression flow as award-mvp; no drive-level scenario " +
      "reaches it.",
    owner: "bloodbowl-phaser maintainers",
    tracking: "openspec/changes/add-comprehensive-e2e-scenario-testing",
  },
  // ----- Kick-off events -----
  // Which kick-off event fires is a 2D6 roll, and only some of them ask the
  // coach to select, move or place a player. A *scripted* case cannot
  // contain those commands without first pinning a seed that produces that
  // specific event — and pinning one per command makes the script a
  // statement about the dice rather than about the rule. The event
  // resolution itself is covered (`decision:kickoff-event`, via
  // `match-opening-to-kickoff`), and the per-event mechanics are covered by
  // the kickoff scenario catalog and __tests__/headless/kickoff-events.
  ...(
    [
      "kickoff-select-player",
      "kickoff-move-player",
      "kickoff-place-player",
      "kickoff-confirm",
    ] as const
  ).map((command) => ({
    entryId: `protocol-command:${command}`,
    reason:
      "Only reachable inside a specific kick-off event, which is a dice " +
      "outcome rather than something a script can request. The kick-off " +
      "decision itself is covered by match-opening-to-kickoff, and the " +
      "individual events by the kickoff catalog and " +
      "__tests__/headless/kickoff-events.test.ts.",
    owner: "bloodbowl-phaser maintainers",
    tracking: "openspec/changes/add-comprehensive-e2e-scenario-testing (follow-up)",
  })),
  {
    entryId: "protocol-command:start-setup",
    reason:
      "The scenario loader assigns the drive from the setup's activeTeam, so " +
      "a scenario-loaded SETUP is already past `start-setup`. A full match " +
      "reaches it (e2e/engine/full-match.e2e.ts drives real setups), but it " +
      "arrives via the coin flip rather than as an explicit command.",
    owner: "bloodbowl-phaser maintainers",
    tracking: "openspec/changes/add-comprehensive-e2e-scenario-testing (follow-up)",
  },
  {
    entryId: "protocol-command:team-reroll-block",
    reason:
      "Spending a Team Re-roll on block dice needs both a banked re-roll and " +
      "a block whose faces are worth re-rolling — a seeded combination the " +
      "rule catalog covers through the Pro and Brawler configs instead " +
      "(pro-rerolls-a-block-die, brawler-rerolls-both-down).",
    owner: "bloodbowl-phaser maintainers",
    tracking: "openspec/changes/add-comprehensive-e2e-scenario-testing (follow-up)",
  },
  {
    entryId: "phase:HALFTIME",
    reason:
      "HALFTIME is transient: it is entered and left inside a single command " +
      "as the drive rolls over, so no snapshot ever observes it. That both " +
      "halves are played is asserted directly by the full-match spec " +
      "(`sawHalftime`), which is the property that actually matters.",
    owner: "bloodbowl-phaser maintainers",
    tracking: "openspec/changes/add-comprehensive-e2e-scenario-testing (follow-up)",
  },
  {
    entryId: "decision:follow-up",
    layers: ["browser"],
    reason:
      "A follow-up is only offered after a Push, which depends on the block " +
      "dice. The browser journey answers the dialog whenever the roll " +
      "produces one, but cannot guarantee it without a browser-specific " +
      "seed — see the decision:reroll note below for why seeds do not carry " +
      "across lanes. The engine lane covers both follow-up branches.",
    owner: "bloodbowl-phaser maintainers",
    tracking: "openspec/changes/add-comprehensive-e2e-scenario-testing (follow-up)",
  },
  {
    entryId: "decision:reroll",
    layers: ["browser"],
    reason:
      "A re-roll offer needs a *failed* roll, which needs a committed seed — " +
      "but the browser's scenario loader draws from the RNG while setting the " +
      "board up (weather, kickoff), so the engine's committed seed does not " +
      "reproduce the same failure in the browser. The dialog itself is " +
      "covered by __tests__/unit/kickoffSandboxOverlay and the engine lane " +
      "covers every re-roll branch; closing this properly means making " +
      "scenario loading RNG-neutral, which is an engine change.",
    owner: "bloodbowl-phaser maintainers",
    tracking: "openspec/changes/add-comprehensive-e2e-scenario-testing (follow-up)",
  },
  {
    entryId: "protocol-command:setup-concession",
    reason:
      "Conceding during setup ends the match rather than exercising a rule; " +
      "the flow is covered by the setup controller tests.",
    owner: "bloodbowl-phaser maintainers",
    tracking: "openspec/changes/add-comprehensive-e2e-scenario-testing",
  },
];

export interface ExclusionIssue {
  entryId: string;
  message: string;
}

/** Reject an exclusion that does not actually explain itself. */
export function validateExclusions(
  exclusions: CoverageExclusion[] = COVERAGE_EXCLUSIONS,
  knownEntryIds?: ReadonlySet<string>
): ExclusionIssue[] {
  const issues: ExclusionIssue[] = [];
  const seen = new Set<string>();

  for (const exclusion of exclusions) {
    const where = exclusion.entryId;
    if (seen.has(where)) {
      issues.push({ entryId: where, message: "duplicate exclusion" });
    }
    seen.add(where);

    if (!exclusion.reason.trim()) {
      issues.push({ entryId: where, message: "exclusion needs a reason" });
    }
    if (!exclusion.owner.trim()) {
      issues.push({ entryId: where, message: "exclusion needs an owner" });
    }
    if (!exclusion.tracking.trim()) {
      issues.push({
        entryId: where,
        message: "exclusion needs a tracking reference",
      });
    }
    if (knownEntryIds && !knownEntryIds.has(where)) {
      issues.push({
        entryId: where,
        message:
          "exclusion names an inventory entry that no longer exists — " +
          "delete it or fix the id",
      });
    }
  }

  return issues;
}

/** Is this entry excused for this layer? */
export function isExcluded(
  entryId: string,
  layer: ExecutionLayer,
  exclusions: CoverageExclusion[] = COVERAGE_EXCLUSIONS
): boolean {
  return exclusions.some(
    (exclusion) =>
      exclusion.entryId === entryId &&
      (exclusion.layers === undefined || exclusion.layers.includes(layer))
  );
}

/** The exclusion covering an entry, for the report's "why" column. */
export function exclusionFor(
  entryId: string,
  exclusions: CoverageExclusion[] = COVERAGE_EXCLUSIONS
): CoverageExclusion | undefined {
  return exclusions.find((exclusion) => exclusion.entryId === entryId);
}
