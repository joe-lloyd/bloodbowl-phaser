/**
 * A campaign: computer teams in each advancement mode play several league
 * seasons and then a tournament, through the code the app runs for a league
 * the computer plays by itself. createCompetition builds each competition,
 * and simulateFixture plays every fixture as a full match, records it, awards
 * the MVPs and SPP, and makes each team's development choices. The harness
 * checks every team before and after each game.
 *
 * Slow, so it runs only on request:
 *   CAMPAIGN=1 pnpm exec vitest run __tests__/campaign
 * CAMPAIGN_SEASONS and CAMPAIGN_OUT (a JSON report) shape the run.
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createComputerTeam } from "../../src/competition/computerTeams";
import { createCompetition as enterCompetition } from "../../src/competition/create";
import { getCompetition } from "../../src/competition/repository";
import {
  createRosterRuleProfile,
  RosterRuleProfile,
} from "../../src/competition/rosterRules";
import { simulateFixture } from "../../src/competition/simulateFixture";
import {
  CompetitionDoc,
  CompetitionFixture,
  TournamentFormat,
} from "../../src/competition/types";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { getTeamById, saveTeam } from "../../src/game/managers/TeamManager";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { RNGService } from "../../src/services/rng/RNGService";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import {
  isLeagueMode,
  isPendingRaisedDeadRecruit,
  RosterName,
  Team,
  TeamAdvancementMode,
} from "../../src/types/Team";

/** League seasons before the cups; a typo must not quietly run none. */
function seasons(): number {
  const raw = process.env.CAMPAIGN_SEASONS ?? "3";
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error(
      `CAMPAIGN_SEASONS must be a whole number of 1 or more, got "${raw}"`
    );
  }
  return count;
}

const SIDES: Record<TeamAdvancementMode, RosterName[]> = {
  "advanced-league": [
    RosterName.HUMAN,
    RosterName.ORC,
    RosterName.SKAVEN,
    RosterName.NECROMANTIC_HORROR,
  ],
  "sevens-skill-selection": [
    RosterName.DWARF,
    RosterName.WOOD_ELF,
    RosterName.LIZARDMEN,
    RosterName.SHAMBLING_UNDEAD,
  ],
  "matched-play": [
    RosterName.CHAOS_CHOSEN,
    RosterName.HIGH_ELF,
    RosterName.NORSE,
    RosterName.GOBLIN,
  ],
};

interface Finding {
  where: string;
  rule: string;
  detail: string;
}

interface FixtureLog {
  competition: string;
  fixture: string;
  home: string;
  away: string;
  score: [number, number];
  seed: number;
  commands: number;
  recorded: boolean;
  spp: Record<string, number>;
  development: string[];
}

/** Broken invariants: the run fails on any. */
const findings: Finding[] = [];
/** Worth reading, but within the rules: shoot-outs, short rosters. */
const happenings: Finding[] = [];
const fixtures: FixtureLog[] = [];
const seasonsLog: {
  name: string;
  standings: { team: string; w: number; d: number; l: number; pts: number }[];
}[] = [];

function note(where: string, rule: string, detail: string): void {
  findings.push({ where, rule, detail });
}

function happened(where: string, rule: string, detail: string): void {
  happenings.push({ where, rule, detail });
}

/** The stored shape, as written, before loading tidies it. */
function storedTeam(teamId: string): Record<string, unknown> | undefined {
  const raw = JSON.parse(localStorage.getItem("bloodbowl_teams") ?? "[]") as {
    id: string;
  }[];
  return raw.find((team) => team.id === teamId);
}

const coachRng = new RNGService(20261108);

function mustLoad(teamId: string): Team {
  const team = getTeamById(teamId);
  if (!team) throw new Error(`${teamId} is not in the library`);
  return team;
}

// ===== Team Builder and CompetitionBuilder =====

function buildTeams(
  mode: TeamAdvancementMode,
  rosters: RosterName[],
  tag: string
): string[] {
  return rosters.map((roster, index) => {
    const name = tag ? `${roster} ${tag}` : roster;
    const team = createComputerTeam(
      roster,
      name,
      0x224488 + index * 0x331100,
      mode
    );
    saveTeam(team);
    return team.id;
  });
}

async function createCompetition(
  type: "league" | "tournament",
  name: string,
  teamIds: string[],
  profile: RosterRuleProfile,
  format: TournamentFormat = "single-elimination"
): Promise<CompetitionDoc | null> {
  try {
    return await enterCompetition({
      type,
      name,
      format,
      organizerUid: null,
      entrants: teamIds.map((id) => ({ team: mustLoad(id), ownerUid: null })),
      profile,
    });
  } catch (cause) {
    note(name, "entry-refused", String(cause));
    return null;
  }
}

// ===== A simulated fixture =====

let nextSeed = 1;
async function playFixture(
  competitionId: string,
  type: "league" | "tournament",
  fixture: CompetitionFixture
): Promise<"recorded" | "unrecorded"> {
  const competition = (await getCompetition(type, competitionId))!;
  const entrant = (id: string | null) =>
    competition.entrants.find((e) => e.id === id)!;
  const where = `${competition.name} ${fixture.id}`;
  const home = mustLoad(entrant(fixture.homeEntrantId).teamId);
  const away = mustLoad(entrant(fixture.awayEntrantId).teamId);
  for (const team of [home, away]) {
    if ((team.pendingDevelopment?.length ?? 0) > 0)
      note(
        where,
        "launch-blocked",
        `${team.name} still has ${team.pendingDevelopment!.map((e) => e.kind).join(", ")}`
      );
  }
  const before = new Map(
    [home, away].map((team) => [team.id, structuredClone(team)])
  );

  const seed = nextSeed++;
  let outcome: Awaited<ReturnType<typeof simulateFixture>>;
  try {
    outcome = await simulateFixture(competition, fixture.id, {
      seed,
      rng: coachRng,
      inspect: (game) => checkKickoff(where, game, before),
    });
  } catch (cause) {
    note(where, "simulation-failed", String(cause));
    return "unrecorded";
  }
  for (const finding of outcome.recording.findings)
    note(where, `match-${finding.kind}`, `${finding.key}: ${finding.message}`);
  for (const report of outcome.management) {
    for (const refused of report.refused)
      note(where, refused.rule, refused.detail);
    for (const setback of report.setbacks)
      happened(where, setback.rule, setback.detail);
  }
  const result = outcome.fixture.result!;
  if (result.penalties)
    happened(
      where,
      "penalties",
      `${result.homeScore}-${result.awayScore}, shoot-out ${result.penalties.home}-${result.penalties.away}`
    );
  const winnerTeamId = competition.entrants.find(
    (e) => e.id === result.winnerEntrantId
  )?.teamId;

  checkAfterMatch(
    where,
    competition,
    fixture,
    before,
    {
      [home.id]: [result.homeScore, result.awayScore],
      [away.id]: [result.awayScore, result.homeScore],
    },
    outcome.sppEarned,
    winnerTeamId
  );
  for (const team of [home, away]) checkTeam(where, mustLoad(team.id));

  fixtures.push({
    competition: competition.name,
    fixture: fixture.id,
    home: home.name,
    away: away.name,
    score: [result.homeScore, result.awayScore],
    seed,
    commands: outcome.recording.steps.length,
    recorded: true,
    spp: Object.fromEntries(
      [home, away].map((team) => [
        team.name,
        team.players.reduce(
          (sum, p) => sum + (outcome.sppEarned[p.id] ?? 0),
          0
        ),
      ])
    ),
    development: outcome.management.flatMap((report) => report.done),
  });
  return "recorded";
}

// ===== Invariants =====

/**
 * A league team at kick-off (I4, L2): a Miss Next Game player sits in the
 * Casualty box, and Journeymen bring the available players up to 7.
 */
function checkKickoff(
  where: string,
  game: HeadlessGame,
  before: Map<string, Team>
): void {
  for (const team of [game.ctx.team1, game.ctx.team2]) {
    if (!isLeagueMode(team.advancementMode)) continue;
    const owed = before
      .get(team.id)!
      .players.filter((p) => p.injuries.includes(InjuryType.MISS_NEXT_GAME));
    for (const player of owed) {
      const inMatch = team.players.find((p) => p.id === player.id);
      if (inMatch?.status !== PlayerStatus.INJURED)
        note(
          where,
          "miss-next-game-played",
          `${team.name} ${player.playerName} is ${inMatch?.status}`
        );
    }
    const journeymen = team.players.filter(
      (p) => p.playerKind === "journeyman"
    ).length;
    const available = team.players.filter(
      (p) =>
        p.status === PlayerStatus.RESERVE &&
        p.playerKind !== "journeyman" &&
        !isPendingRaisedDeadRecruit(team, p.id)
    ).length;
    if (journeymen !== Math.max(0, 7 - available))
      note(
        where,
        "journeymen",
        `${team.name}: ${available} available, ${journeymen} Journeymen`
      );
  }
}

function checkAfterMatch(
  where: string,
  competition: CompetitionDoc,
  fixture: CompetitionFixture,
  before: Map<string, Team>,
  scores: Record<string, [number, number]>,
  sppEarned: Record<string, number>,
  winnerTeamId: string | undefined
): void {
  const key = `${competition.id}:${fixture.id}`;
  for (const [teamId, previous] of before) {
    const now = mustLoad(teamId);
    const [own, other] = scores[teamId];
    if (own !== other && !winnerTeamId)
      note(
        where,
        "winner",
        `${now.name}: ${own}-${other} recorded without a winner`
      );
    const expect = {
      wins: (previous.wins ?? 0) + (winnerTeamId === teamId ? 1 : 0),
      draws: (previous.draws ?? 0) + (winnerTeamId ? 0 : 1),
      losses:
        (previous.losses ?? 0) +
        (winnerTeamId && winnerTeamId !== teamId ? 1 : 0),
      touchdowns: (previous.touchdowns ?? 0) + own,
    };
    for (const field of ["wins", "draws", "losses", "touchdowns"] as const) {
      if ((now[field] ?? 0) !== expect[field])
        note(
          where,
          `record-${field}`,
          `${now.name}: ${now[field]}, expected ${expect[field]}`
        );
    }
    const ids = now.recordedFixtureIds ?? [];
    if (ids.filter((id) => id === key).length !== 1)
      note(
        where,
        "recorded-fixture-id",
        `${now.name} holds ${key} ${ids.filter((id) => id === key).length} times`
      );
    // Every SPP earned is still held, or was spent on a new advancement
    for (const player of previous.players) {
      const stored = now.players.find((p) => p.id === player.id);
      if (!stored) continue;
      const had = new Set((player.advancements ?? []).map((a) => a.id));
      const spent = (stored.advancements ?? [])
        .filter((a) => !had.has(a.id))
        .reduce((sum, a) => sum + a.sppCost, 0);
      const expected = (player.spp ?? 0) + (sppEarned[player.id] ?? 0);
      if ((stored.spp ?? 0) + spent !== expected)
        note(
          where,
          "spp-persisted",
          `${now.name} ${player.playerName}: ${stored.spp} held + ${spent} spent, expected ${expected}`
        );
    }
    if (competition.status === "active" && now.firstMatchPlayedAt == null)
      note(
        where,
        "first-match-stamp",
        `${now.name} is still a draft team after a recorded match`
      );
    if ((now.pendingDevelopment?.length ?? 0) > 0)
      note(
        where,
        "development-left",
        `${now.name}: ${now.pendingDevelopment!.map((e) => e.kind).join(", ")}`
      );
  }
}

function checkTeam(where: string, team: Team): void {
  const stored = storedTeam(team.id) as { players: { playerKind?: string }[] };
  if (stored.players.some((p) => p.playerKind === "journeyman"))
    note(
      where,
      "journeyman-stored",
      `${team.name} keeps a Journeyman in storage`
    );
  if (team.players.length > team.maxRosterSize)
    note(
      where,
      "roster-size",
      `${team.name} has ${team.players.length} of ${team.maxRosterSize}`
    );
  if (
    isLeagueMode(team.advancementMode)
      ? team.dedicatedFans < 1 || team.dedicatedFans > 5
      : team.dedicatedFans !== 0
  )
    note(where, "dedicated-fans", `${team.name} has ${team.dedicatedFans}`);
  const roster = getRosterByRosterName(team.rosterName);
  const illegal = validateRosterLegality(team, roster);
  if (illegal.length > 0)
    note(
      where,
      "roster-legality",
      `${team.name}: ${illegal.map((v) => v.detail).join("; ")}`
    );
  for (const player of team.players) {
    const types = player.skills.map((s) => s.type);
    if (new Set(types).size !== types.length)
      note(
        where,
        "duplicate-skill",
        `${team.name} ${player.playerName}: ${types.join(", ")}`
      );
    if ((player.spp ?? 0) < 0)
      note(where, "negative-spp", `${team.name} ${player.playerName}`);
    if (
      player.level !== Math.min(6, player.advancements?.length ?? 0) &&
      (player.advancements?.length ?? 0) > 0
    )
      note(
        where,
        "level",
        `${team.name} ${player.playerName} level ${player.level} with ${player.advancements?.length} advancements`
      );
    if (
      team.advancementMode !== "matched-play" &&
      player.injuries.includes(InjuryType.DEAD)
    )
      note(where, "dead-on-roster", `${team.name} ${player.playerName}`);
    if (team.advancementMode === "matched-play" && player.injuries.length > 0)
      note(
        where,
        "matched-play-injury-kept",
        `${team.name} ${player.playerName}: ${player.injuries.join(", ")}`
      );
    if (
      team.advancementMode !== "advanced-league" &&
      (player.spp ?? 0) > 0 &&
      player.playerKind !== "star"
    )
      note(
        where,
        "spp-outside-advanced-league",
        `${team.name} ${player.playerName}: ${player.spp}`
      );
  }
}

async function finishCompetition(
  competition: CompetitionDoc,
  teamIds: string[]
): Promise<void> {
  const latest = (await getCompetition(competition.type, competition.id))!;
  if (latest.status !== "complete")
    note(
      latest.name,
      "competition-status",
      `still ${latest.status} after every fixture`
    );
  for (const teamId of teamIds) {
    const team = mustLoad(teamId);
    if (team.activeCompetitionId)
      note(
        latest.name,
        "active-competition-kept",
        `${team.name} still points at ${team.activeCompetitionId}`
      );
  }
  for (const standing of latest.standings) {
    const played = latest.fixtures.filter(
      (f) =>
        f.status === "complete" &&
        !f.result?.bye &&
        (latest.entrants.find((e) => e.id === f.homeEntrantId)?.id ===
          standing.entrantId ||
          latest.entrants.find((e) => e.id === f.awayEntrantId)?.id ===
            standing.entrantId)
    ).length;
    if (standing.wins + standing.draws + standing.losses !== played)
      note(
        latest.name,
        "standings-played",
        `${standing.entrantId}: ${standing.wins}/${standing.draws}/${standing.losses} over ${played} games`
      );
  }
  seasonsLog.push({
    name: latest.name,
    standings: latest.standings.map((s) => ({
      team:
        latest.entrants.find((e) => e.id === s.entrantId)?.name ?? s.entrantId,
      w: s.wins,
      d: s.draws,
      l: s.losses,
      pts: s.points ?? 0,
    })),
  });
}

/** Play every fixture that is ready, round by round, until none are left. */
async function playCompetition(competition: CompetitionDoc): Promise<void> {
  for (let guard = 0; guard < 200; guard++) {
    const latest = (await getCompetition(competition.type, competition.id))!;
    const next = latest.fixtures.find(
      (f) => f.status !== "complete" && f.homeEntrantId && f.awayEntrantId
    );
    if (!next) return;
    if (
      (await playFixture(competition.id, competition.type, next)) !== "recorded"
    ) {
      note(latest.name, "bracket-stuck", `${next.id} could not be recorded`);
      return;
    }
  }
}

describe.runIf(process.env.CAMPAIGN === "1")("a three-season campaign", () => {
  it("plays seasons and a tournament in every advancement mode", async () => {
    const seasonCount = seasons();
    localStorage.clear();
    const modes = Object.keys(SIDES) as TeamAdvancementMode[];
    const teamsByMode = new Map(
      modes.map((mode) => [mode, buildTeams(mode, SIDES[mode], "")])
    );
    const profiles = new Map(
      modes.map((mode) => [
        mode,
        createRosterRuleProfile({ advancementMode: mode }),
      ])
    );

    for (let season = 1; season <= seasonCount; season++) {
      for (const mode of modes) {
        const teamIds = teamsByMode.get(mode)!;
        const league = await createCompetition(
          "league",
          `${mode} season ${season}`,
          teamIds,
          profiles.get(mode)!
        );
        if (!league) continue;
        await playCompetition(league);
        await finishCompetition(league, teamIds);
      }
    }

    // The tournament: a bracket of six, the veterans and two new teams
    for (const mode of modes) {
      const newcomers = buildTeams(
        mode,
        mode === "advanced-league"
          ? [RosterName.DARK_ELF, RosterName.OGRE]
          : mode === "sevens-skill-selection"
            ? [RosterName.AMAZON, RosterName.VAMPIRE]
            : [RosterName.HALFLING, RosterName.BLACK_ORC],
        "Rookies"
      );
      const teamIds = [...teamsByMode.get(mode)!, ...newcomers];
      const cup = await createCompetition(
        "tournament",
        `${mode} cup`,
        teamIds,
        profiles.get(mode)!,
        mode === "matched-play" ? "round-robin" : "single-elimination"
      );
      if (!cup) continue;
      await playCompetition(cup);
      await finishCompetition(cup, teamIds);
    }

    const finalTeams = [...teamsByMode.values()]
      .flat()
      .map(mustLoad)
      .map((team) => ({
        name: team.name,
        mode: team.advancementMode,
        record: `${team.wins}-${team.draws}-${team.losses}`,
        touchdowns: team.touchdowns,
        teamValue: team.teamValue,
        treasury: team.treasury,
        fans: team.dedicatedFans,
        drafted: (team.draftHistory ?? []).length,
        players: team.players.map((p) => ({
          name: p.playerName,
          spp: p.spp,
          level: p.level,
          skills: p.skills.map((s) => s.type),
          injuries: p.injuries,
          advancements: (p.advancements ?? []).map(
            (a) => `${a.type}:${a.name}`
          ),
        })),
      }));

    if (process.env.CAMPAIGN_OUT) {
      writeFileSync(
        process.env.CAMPAIGN_OUT,
        JSON.stringify(
          {
            findings,
            happenings,
            fixtures,
            seasons: seasonsLog,
            teams: finalTeams,
          },
          null,
          2
        )
      );
    }
    const byRule = (list: Finding[]) =>
      Object.fromEntries(
        [...new Set(list.map((f) => f.rule))].map((rule) => [
          rule,
          list.filter((f) => f.rule === rule).length,
        ])
      );
    console.log(`campaign: ${fixtures.length} fixtures`, byRule(happenings));
    expect(fixtures.length).toBeGreaterThan(0);
    expect(findings).toEqual([]);
  }, 3_600_000);
});
