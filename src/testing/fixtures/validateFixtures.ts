/**
 * Fixture-authenticity validation.
 *
 * A scenario setup may grant skills to a placement. That is legitimate two
 * ways round and misleading a third:
 *
 *   - Redundant: the position already has the skill. Harmless, but it hides
 *     the roster fact and rots when the roster changes.
 *   - Rules-valid advancement: the granted player's own position could
 *     legally develop the skill (its category is in that position's primary
 *     or secondary access). This is the everyday case and is allowed.
 *   - Implausible: the position could never hold the skill — a Mutation on a
 *     Human, a trait nobody advances into. That fields a player who cannot
 *     exist, so it must either move to the native roster fixture this module
 *     can name, or carry a written isolation reason.
 */

import { RosterName } from "../../types/Team";
import { SkillType } from "../../types/Skills";
import { ScenarioSetup, PlayerPlacement } from "../../types/Scenario";
import {
  GrantLegality,
  grantLegality,
  nativeFixtures,
  nativePositions,
  positionAt,
} from "./rosterFixtures";

/** A grant the author declared, with the reason that justifies it. */
export interface DeclaredGrant {
  /** `team1:3` */
  player: string;
  skill: SkillType;
  reason: string;
}

export type FixtureIssueKind = "redundant-grant" | "implausible-grant";

/**
 * Why a grant that is not a rules-valid advancement was still allowed.
 *
 * `forced` is the honest, common case: no Sevens composition fields a
 * position that owns the skill, so there is no native fixture to prefer.
 * That is a property of the compositions, not a decision each case should
 * restate, so it is derived rather than declared — and it is reported, so
 * adding such a position to a composition later shows up as a chance to
 * improve the fixture.
 */
export type GrantJustification = "forced" | "declared";

export interface FixtureIssue {
  /** Case or rule-config id. */
  ownerId: string;
  player: string;
  skill: SkillType;
  kind: FixtureIssueKind;
  message: string;
}

/** A grant that passed, with how it is justified — for the coverage report. */
export interface FixtureGrantRecord {
  ownerId: string;
  player: string;
  skill: SkillType;
  roster: RosterName;
  positionName: string;
  legality: GrantLegality;
  /** Set for grants that are neither native nor a legal advancement. */
  justification?: GrantJustification;
  /** Present when an isolation reason was declared. */
  reason?: string;
  /**
   * For `forced` grants, the roster position that owns the skill natively
   * but is not currently fielded — the fixture this case could use if the
   * Sevens composition gained that position.
   */
  unfieldedNative?: { roster: RosterName; positionName: string };
}

export interface FixtureAudit {
  issues: FixtureIssue[];
  grants: FixtureGrantRecord[];
}

function describeSlot(roster: RosterName, playerIndex: number): string {
  const position = positionAt(roster, playerIndex);
  return position ? `${roster} "${position}"` : `${roster} #${playerIndex}`;
}

function grantedSkills(placement: PlayerPlacement): SkillType[] {
  return (placement.skills ?? []).map((entry) =>
    typeof entry === "string" ? (entry as SkillType) : entry.type
  );
}

export interface AuditOptions {
  /** Default roster when the setup does not pin one (matches the engine). */
  defaultRoster?: RosterName;
}

/**
 * Audit one scenario setup's skill grants against the roster it fields.
 *
 * `declared` is the case's own justification list — `ScenarioCase.syntheticGrants`
 * or `RuleConfig.skillProvenance`, both of which carry a reason per grant.
 */
export function auditSetupFixtures(
  ownerId: string,
  setup: ScenarioSetup,
  declared: DeclaredGrant[] = [],
  options: AuditOptions = {}
): FixtureAudit {
  const issues: FixtureIssue[] = [];
  const grants: FixtureGrantRecord[] = [];
  const fallback = options.defaultRoster ?? RosterName.HUMAN;
  const reasons = new Map(
    declared
      .filter((grant) => grant.reason.trim().length > 0)
      .map((grant) => [`${grant.player}|${grant.skill}`, grant.reason])
  );

  const sides: {
    team: "team1" | "team2";
    roster: RosterName;
    placements: PlayerPlacement[];
  }[] = [
    {
      team: "team1",
      roster: setup.team1Roster ?? fallback,
      placements: setup.team1Placements,
    },
    {
      team: "team2",
      roster: setup.team2Roster ?? fallback,
      placements: setup.team2Placements,
    },
  ];

  for (const side of sides) {
    for (const placement of side.placements) {
      const player = `${side.team}:${placement.playerIndex}`;
      for (const skill of grantedSkills(placement)) {
        const legality = grantLegality(
          side.roster,
          placement.playerIndex,
          skill
        );
        const reason = reasons.get(`${player}|${skill}`);
        const record: FixtureGrantRecord = {
          ownerId,
          player,
          skill,
          roster: side.roster,
          positionName: positionAt(side.roster, placement.playerIndex) ?? "?",
          legality,
          ...(reason ? { reason } : {}),
        };
        grants.push(record);

        if (legality === "native") {
          issues.push({
            ownerId,
            player,
            skill,
            kind: "redundant-grant",
            message:
              `${player} (${describeSlot(side.roster, placement.playerIndex)}) ` +
              `already has ${skill} from its roster — drop the grant`,
          });
          continue;
        }

        if (legality !== "illegal") continue; // rules-valid advancement

        if (reason) {
          record.justification = "declared";
          continue;
        }

        const native = nativeFixtures(skill)[0];
        if (!native) {
          // No fielded position owns it, so there is nothing to prefer. Note
          // the unfielded holder, if any, so growing a composition later
          // surfaces as an improvement rather than staying invisible.
          record.justification = "forced";
          const unfielded = nativePositions(skill).find((p) => !p.fielded);
          if (unfielded) {
            record.unfieldedNative = {
              roster: unfielded.roster,
              positionName: unfielded.positionName,
            };
          }
          continue;
        }

        issues.push({
          ownerId,
          player,
          skill,
          kind: "implausible-grant",
          message:
            `${player} (${describeSlot(side.roster, placement.playerIndex)}) ` +
            `cannot legally hold ${skill}, but ${native.roster} "${native.positionName}" ` +
            `(index ${native.playerIndex}) has it natively — field that fixture ` +
            `or record an isolation reason`,
        });
      }
    }
  }

  return { issues, grants };
}

/** Render issues as one readable block for a failing gate. */
export function formatFixtureIssues(issues: FixtureIssue[]): string {
  return issues.map((issue) => `  ${issue.ownerId}: ${issue.message}`).join("\n");
}
