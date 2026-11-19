import { RosterName } from "../../types/Team";
import { SkillType } from "../../types/Skills";
import { type ScenarioSetup, type PlayerPlacement } from "../../types/Scenario";
import {
  type GrantLegality,
  grantLegality,
  nativeFixtures,
  nativePositions,
  positionAt,
} from "./rosterFixtures";

export interface DeclaredGrant {
  player: string;
  skill: SkillType;
  reason: string;
}

type FixtureIssueKind = "redundant-grant" | "implausible-grant";

type GrantJustification = "forced" | "declared";

export interface FixtureIssue {
  ownerId: string;
  player: string;
  skill: SkillType;
  kind: FixtureIssueKind;
  message: string;
}

interface FixtureGrantRecord {
  ownerId: string;
  player: string;
  skill: SkillType;
  roster: RosterName;
  positionName: string;
  legality: GrantLegality;

  justification?: GrantJustification;

  reason?: string;

  unfieldedNative?: { roster: RosterName; positionName: string };
}

export interface FixtureAudit {
  issues: FixtureIssue[];
  grants: FixtureGrantRecord[];
}

function describeSlot(roster: RosterName, playerIndex: number): string {
  const position = positionAt(roster, playerIndex);
  return position
    ? `${roster} "${position}"`
    : `${roster} #${String(playerIndex)}`;
}

function grantedSkills(placement: PlayerPlacement): SkillType[] {
  return (placement.skills ?? []).map((entry) =>
    typeof entry === "string" ? entry : entry.type
  );
}

export interface AuditOptions {
  defaultRoster?: RosterName;
}

interface GrantToAudit {
  ownerId: string;
  roster: RosterName;
  playerIndex: number;

  player: string;
  skill: SkillType;

  reason: string | undefined;
}

function auditGrant(grant: GrantToAudit): {
  record: FixtureGrantRecord;
  issue?: FixtureIssue;
} {
  const { ownerId, roster, playerIndex, player, skill, reason } = grant;
  const legality = grantLegality(roster, playerIndex, skill);
  const record: FixtureGrantRecord = {
    ownerId,
    player,
    skill,
    roster,
    positionName: positionAt(roster, playerIndex) ?? "?",
    legality,
    ...(reason ? { reason } : {}),
  };

  if (legality === "native") {
    return {
      record,
      issue: {
        ownerId,
        player,
        skill,
        kind: "redundant-grant",
        message:
          `${player} (${describeSlot(roster, playerIndex)}) ` +
          `already has ${skill} from its roster — drop the grant`,
      },
    };
  }

  if (legality !== "illegal") return { record };

  if (reason) {
    record.justification = "declared";
    return { record };
  }

  const native = nativeFixtures(skill)[0];
  if (!native) {
    record.justification = "forced";
    const unfielded = nativePositions(skill).find((p) => !p.fielded);
    if (unfielded) {
      record.unfieldedNative = {
        roster: unfielded.roster,
        positionName: unfielded.positionName,
      };
    }
    return { record };
  }

  return {
    record,
    issue: {
      ownerId,
      player,
      skill,
      kind: "implausible-grant",
      message:
        `${player} (${describeSlot(roster, playerIndex)}) ` +
        `cannot legally hold ${skill}, but ${native.roster} "${native.positionName}" ` +
        `(index ${String(native.playerIndex)}) has it natively — field that fixture ` +
        `or record an isolation reason`,
    },
  };
}

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
      const player = `${side.team}:${String(placement.playerIndex)}`;
      for (const skill of grantedSkills(placement)) {
        const { record, issue } = auditGrant({
          ownerId,
          roster: side.roster,
          playerIndex: placement.playerIndex,
          player,
          skill,
          reason: reasons.get(`${player}|${skill}`),
        });
        grants.push(record);
        if (issue) issues.push(issue);
      }
    }
  }

  return { issues, grants };
}

export function formatFixtureIssues(issues: FixtureIssue[]): string {
  return issues
    .map((issue) => `  ${issue.ownerId}: ${issue.message}`)
    .join("\n");
}
