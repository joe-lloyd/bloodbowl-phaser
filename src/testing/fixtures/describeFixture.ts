import { RosterName } from "../../types/Team";
import { type PlayerPlacement } from "../../types/Scenario";
import { type ScenarioCase } from "../scenarioCase/types";
import {
  type GrantLegality,
  grantLegality,
  nativeFixtures,
  nativeSkillsAt,
  positionAt,
} from "./rosterFixtures";

interface PlacementDescription {
  ref: string;
  roster: RosterName;
  positionName: string;

  nativeSkills: string[];

  grants: {
    skill: string;
    legality: GrantLegality;

    reason?: string;

    preferredNative?: string;
  }[];

  statOverrides: string[];
}

export interface FixtureDescription {
  team1Roster: RosterName;
  team2Roster: RosterName;
  placements: PlacementDescription[];

  fullyAuthentic: boolean;
}

const DEFAULT_ROSTER = RosterName.HUMAN;

function describePlacement(
  team: "team1" | "team2",
  roster: RosterName,
  placement: PlayerPlacement,
  reasons: Map<string, string>
): PlacementDescription {
  const ref = `${team}:${String(placement.playerIndex)}`;
  const granted = (placement.skills ?? []).map((entry) =>
    typeof entry === "string" ? entry : entry.type
  );

  return {
    ref,
    roster,
    positionName: positionAt(roster, placement.playerIndex) ?? "unknown",
    nativeSkills: nativeSkillsAt(roster, placement.playerIndex).map(String),
    grants: granted.map((skill) => {
      const legality = grantLegality(roster, placement.playerIndex, skill);
      const native =
        legality === "illegal" ? nativeFixtures(skill)[0] : undefined;
      const reason = reasons.get(`${ref}|${skill}`);
      return {
        skill: String(skill),
        legality,
        ...(reason === undefined ? {} : { reason }),
        ...(native
          ? { preferredNative: `${native.roster} ${native.positionName}` }
          : {}),
      };
    }),
    statOverrides: Object.entries(placement.stats ?? {}).map(
      ([stat, value]) => `${stat} ${String(value)}`
    ),
  };
}

export function describeFixture(
  scenarioCase: ScenarioCase
): FixtureDescription {
  const team1Roster = scenarioCase.setup.team1Roster ?? DEFAULT_ROSTER;
  const team2Roster = scenarioCase.setup.team2Roster ?? DEFAULT_ROSTER;
  const reasons = new Map(
    (scenarioCase.syntheticGrants ?? []).map((grant) => [
      `${grant.player}|${String(grant.skill)}`,
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
