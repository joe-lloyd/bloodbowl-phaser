/**
 * Human-readable fixture authenticity for a scenario case.
 *
 * The sandbox shows this so a coach reading a scenario can tell, at a
 * glance, whether the players on the pitch are real roster entries or props:
 * which roster and position each placement is, which of the relevant skills
 * come from the roster, and — for anything granted — why a native fixture
 * could not be used.
 */

import { RosterName } from "../../types/Team";
import { SkillType } from "../../types/Skills";
import { PlayerPlacement } from "../../types/Scenario";
import { ScenarioCase } from "../scenarioCase/types";
import {
  GrantLegality,
  grantLegality,
  nativeFixtures,
  nativeSkillsAt,
  positionAt,
} from "./rosterFixtures";

export interface PlacementDescription {
  /** `team1:3` */
  ref: string;
  roster: RosterName;
  positionName: string;
  /** Skills this position starts with. */
  nativeSkills: string[];
  /** Skills the scenario added on top, with how they are justified. */
  grants: {
    skill: string;
    legality: GrantLegality;
    /** Written isolation reason, when the case records one. */
    reason?: string;
    /** The roster position that owns it natively, when one is fielded. */
    preferredNative?: string;
  }[];
  /** Stat overrides the scenario pins, e.g. `AV 4`. */
  statOverrides: string[];
}

export interface FixtureDescription {
  team1Roster: RosterName;
  team2Roster: RosterName;
  placements: PlacementDescription[];
  /** True when nothing on the pitch needed an unexplained grant. */
  fullyAuthentic: boolean;
}

const DEFAULT_ROSTER = RosterName.HUMAN;

function describePlacement(
  team: "team1" | "team2",
  roster: RosterName,
  placement: PlayerPlacement,
  reasons: Map<string, string>
): PlacementDescription {
  const ref = `${team}:${placement.playerIndex}`;
  const granted = (placement.skills ?? []).map((entry) =>
    typeof entry === "string" ? (entry as SkillType) : entry.type
  );

  return {
    ref,
    roster,
    positionName: positionAt(roster, placement.playerIndex) ?? "unknown",
    nativeSkills: nativeSkillsAt(roster, placement.playerIndex).map(String),
    grants: granted.map((skill) => {
      const legality = grantLegality(roster, placement.playerIndex, skill);
      const native = legality === "illegal" ? nativeFixtures(skill)[0] : undefined;
      return {
        skill: String(skill),
        legality,
        ...(reasons.has(`${ref}|${skill}`)
          ? { reason: reasons.get(`${ref}|${skill}`) }
          : {}),
        ...(native
          ? { preferredNative: `${native.roster} ${native.positionName}` }
          : {}),
      };
    }),
    statOverrides: Object.entries(placement.stats ?? {}).map(
      ([stat, value]) => `${stat} ${value}`
    ),
  };
}

export function describeFixture(scenarioCase: ScenarioCase): FixtureDescription {
  const team1Roster = scenarioCase.setup.team1Roster ?? DEFAULT_ROSTER;
  const team2Roster = scenarioCase.setup.team2Roster ?? DEFAULT_ROSTER;
  const reasons = new Map(
    (scenarioCase.syntheticGrants ?? []).map((grant) => [
      `${grant.player}|${grant.skill}`,
      grant.reason,
    ])
  );

  const placements = [
    ...scenarioCase.setup.team1Placements.map((placement) =>
      describePlacement("team1", team1Roster, placement, reasons)
    ),
    ...scenarioCase.setup.team2Placements.map((placement) =>
      describePlacement("team2", team2Roster, placement, reasons)
    ),
  ];

  return {
    team1Roster,
    team2Roster,
    placements,
    fullyAuthentic: placements.every((placement) =>
      placement.grants.every(
        (grant) => grant.legality !== "illegal" || !!grant.reason
      )
    ),
  };
}
