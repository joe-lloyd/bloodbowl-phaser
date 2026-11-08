/**
 * A campaign: teams in each advancement mode play several league seasons and
 * then a tournament, the way a coach plays them through the app. Every
 * fixture is a full simulated match. Around it the harness does what the
 * screens do: CompetitionBuilder creates each competition, CompetitionView
 * launches a fixture, GamePage records it at full time, the results screen
 * awards the MVP and confirms SPP, and Manage Team and the player page
 * spend what the players earned.
 *
 * Slow, so it runs only on request:
 *   CAMPAIGN=1 pnpm exec vitest run __tests__/campaign
 * CAMPAIGN_SEASONS, CAMPAIGN_OUT (a JSON report) and CAMPAIGN_PROGRESSION=0
 * (play fixtures without progression) shape the run.
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
  seedEntrants,
} from "../../src/competition/logic";
import {
  getCompetition,
  saveCompetition,
} from "../../src/competition/repository";
import {
  keepRecordedResult,
  recordCompetitionFixture,
} from "../../src/competition/resultRecording";
import {
  assertEntrantsCompatible,
  createRosterRuleProfile,
  RosterRuleProfile,
} from "../../src/competition/rosterRules";
import {
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionFixture,
  DEFAULT_LEAGUE_POINTS,
  TournamentFormat,
} from "../../src/competition/types";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { getTeamById, saveTeam } from "../../src/game/managers/TeamManager";
import {
  allocateMatchedPlaySkill,
  chooseSecondarySkill,
  createPendingSkillSelection,
  draftedPlayerPrice,
  eligibleSkillSelectionPlayers,
  keepDraftedPlayer,
  nominatePrimarySkill,
  releaseDraftedPlayer,
  rollPrimarySelection,
  rollSecondaryCandidates,
  skillSelectionDecision,
  startPrimarySelection,
  startSecondarySelection,
} from "../../src/game/progression/advancementModes";
import { foldMatchSummaryIntoCareers } from "../../src/game/progression/careerStats";
import {
  AdvancementChoice,
  applyAdvancement,
  canAdvance,
  characteristicChoices,
  eligibleSkills,
  mustAdvance,
  nextAdvancementCosts,
  rollRandomPrimaryCandidates,
} from "../../src/game/progression/progression";
import { validateInsignificant } from "../../src/game/rules/insignificant";
import {
  canKeepRaisedDead,
  offerRaisedDeadRecruit,
  resolveRaisedDeadRecruit,
} from "../../src/game/rules/raiseDead";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";
import { stampFirstCompletedMatch } from "../../src/game/rules/teamLifecycle";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { RNGService } from "../../src/services/rng/RNGService";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { runMatch } from "../../src/simulation/runMatch";
import { GamePhase } from "../../src/types/GameState";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import {
  addPlayerToTeam,
  calculateTeamValue,
  isLeagueMode,
  isPendingRaisedDeadRecruit,
  RosterName,
  startingDedicatedFans,
  Team,
  TeamAdvancementMode,
} from "../../src/types/Team";
import { createPlayer, PositionKeyWord } from "../../src/types/Player";
import { canEdit } from "../../src/game/rules/teamEditLegality";
import { priceOf } from "../../src/game/rules/teamPricing";

const SEASONS = Number(process.env.CAMPAIGN_SEASONS ?? 3);
const PROGRESSION = process.env.CAMPAIGN_PROGRESSION !== "0";

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

// ===== Team Builder =====

function buildTeams(
  mode: TeamAdvancementMode,
  rosters: RosterName[],
  tag: string
): string[] {
  return rosters.map((roster, index) => {
    const name = tag ? `${roster} ${tag}` : roster;
    const team = createReadyMadeTeam(roster, name, 0x224488 + index * 0x331100);
    // Team Builder picks the mode when the team is created
    team.advancementMode = mode;
    team.advancementModeLocked = true;
    team.dedicatedFans = startingDedicatedFans(mode);
    if (mode === "matched-play") {
      // Matched Play buys its skills at creation: one Primary skill
      const rosterData = getRosterByRosterName(team.rosterName);
      for (const player of team.players) {
        const skill = eligibleSkills(player, player.primary ?? [])[0];
        if (!skill) continue;
        try {
          allocateMatchedPlaySkill(team, rosterData, player, skill, "primary");
          break;
        } catch (cause) {
          note(team.name, "matched-play-allocation", String(cause));
        }
      }
    }
    team.teamValue = calculateTeamValue(team);
    saveTeam(team);
    return team.id;
  });
}

// ===== CompetitionBuilder.create =====

async function createCompetition(
  type: "league" | "tournament",
  name: string,
  teamIds: string[],
  profile: RosterRuleProfile,
  format: TournamentFormat = "single-elimination"
): Promise<CompetitionDoc | null> {
  const teams = teamIds.map(mustLoad);
  for (const team of teams) {
    if (team.activeCompetitionId) {
      note(
        name,
        "entry-blocked",
        `${team.name} is still in ${team.activeCompetitionId}`
      );
      return null;
    }
    const roster = getRosterByRosterName(team.rosterName);
    const illegal = validateRosterLegality(team, roster);
    const insignificant = validateInsignificant(team.players);
    if (illegal.length > 0 || insignificant) {
      note(
        name,
        "entry-illegal",
        `${team.name}: ${[...illegal.map((v) => v.detail), insignificant].filter(Boolean).join("; ")}`
      );
      return null;
    }
  }
  try {
    assertEntrantsCompatible(teams, profile);
  } catch (cause) {
    note(name, "entry-incompatible", String(cause));
    return null;
  }
  const entrants = seedEntrants(
    teams.map((team) => ({
      id: `local:${team.id}`,
      teamId: team.id,
      ownerUid: null,
      name: team.name,
      coachName: undefined,
      coachUid: null,
      rosterName: team.rosterName,
    }))
  ) as CompetitionEntrant[];
  const fixtureList =
    type === "league" || format === "round-robin"
      ? generateRoundRobin(entrants)
      : generateSingleElimination(entrants);
  const now = Date.now();
  const base = {
    id: `${type}-${name.replace(/\W+/g, "-")}`,
    name,
    organizerUid: null,
    participantUids: [],
    status: "active" as const,
    entrants,
    fixtures: fixtureList,
    standings: computeStandings(entrants, fixtureList),
    createdAt: now,
    updatedAt: now,
    rosterProfile: profile,
  };
  const competition: CompetitionDoc =
    type === "league"
      ? { ...base, type: "league", points: DEFAULT_LEAGUE_POINTS }
      : { ...base, type: "tournament", format };
  await saveCompetition(competition);
  for (const team of teams) {
    team.activeCompetitionId = competition.id;
    saveTeam(team);
  }
  return competition;
}

// ===== Manage Team and the player page =====

/** PlayerDevelopment: spend what a player has earned, as a keen coach would. */
function spendSpp(team: Team, log: string[]): void {
  for (const player of team.players) {
    for (let guard = 0; guard < 10 && canAdvance(player); guard++) {
      const costs = nextAdvancementCosts(player)!;
      const choice = advancementChoice(player, costs);
      if (!choice) break;
      try {
        applyAdvancement(player, choice);
        team.teamValue = calculateTeamValue(team);
        saveTeam(team);
        log.push(
          `${team.name}: ${player.playerName} took ${describeChoice(choice)}`
        );
      } catch (cause) {
        note(
          team.name,
          "advancement-refused",
          `${player.playerName} ${describeChoice(choice)}: ${cause}`
        );
        break;
      }
    }
  }
}

function describeChoice(choice: AdvancementChoice): string {
  return choice.kind === "characteristic"
    ? `+1 ${choice.stat}`
    : `${choice.kind} ${choice.skill}`;
}

/** Save for a characteristic once close; otherwise take what is affordable. */
function advancementChoice(
  player: Team["players"][number],
  costs: NonNullable<ReturnType<typeof nextAdvancementCosts>>
): AdvancementChoice | null {
  const spp = player.spp ?? 0;
  if (spp >= costs.characteristic) {
    const roll = coachRng.rollDie(8);
    const stats = characteristicChoices(player, roll);
    if (stats.length > 0)
      return { kind: "characteristic", roll, stat: stats[0] };
    const skill = eligibleSkills(player, player.primary ?? [])[0];
    return skill
      ? { kind: "characteristic-fallback", roll, skill, access: "primary" }
      : null;
  }
  if (spp >= costs.chosenSecondary && (player.secondary ?? []).length > 0) {
    const skill = eligibleSkills(player, player.secondary ?? [])[0];
    if (skill) return { kind: "chosen-secondary", skill };
  }
  if (spp >= costs.chosenPrimary) {
    const options = eligibleSkills(player, player.primary ?? []);
    if (options.length > 0)
      return {
        kind: "chosen-primary",
        skill: options[coachRng.rollDie(options.length) - 1],
      };
  }
  const category = (player.primary ?? [])[0];
  if (!category) return null;
  const [first] = rollRandomPrimaryCandidates(player, category, coachRng);
  return { kind: "random-primary", skill: first.skill };
}

/** PendingDevelopmentPanel: resolve every entry the panel would show. */
function resolveDevelopment(teamId: string, log: string[]): void {
  const team = mustLoad(teamId);
  for (
    let guard = 0;
    guard < 40 && (team.pendingDevelopment?.length ?? 0) > 0;
    guard++
  ) {
    const entry = team.pendingDevelopment![0];
    try {
      switch (entry.kind) {
        case "raised-dead-recruit": {
          const keep = canKeepRaisedDead(team, entry.playerId);
          resolveRaisedDeadRecruit(team, entry, keep);
          log.push(`${team.name}: raised dead ${keep ? "hired" : "let go"}`);
          break;
        }
        case "advanced-league-advancement": {
          const player = team.players.find((p) => p.id === entry.playerId);
          if (!player) {
            team.pendingDevelopment = team.pendingDevelopment!.filter(
              (e) => e.id !== entry.id
            );
            break;
          }
          const choice = advancementChoice(
            player,
            nextAdvancementCosts(player)!
          );
          if (!choice)
            throw new Error(`no advancement for ${player.playerName}`);
          applyAdvancement(player, choice);
          if (!mustAdvance(player))
            team.pendingDevelopment = team.pendingDevelopment!.filter(
              (e) => e.id !== entry.id
            );
          log.push(
            `${team.name}: ${player.playerName} required ${describeChoice(choice)}`
          );
          break;
        }
        case "sevens-skill-selection":
          resolveSkillSelection(team, entry, log);
          break;
        case "drafted-player-offer": {
          const player = team.players.find((p) => p.id === entry.playerId)!;
          const keep =
            draftedPlayerPrice(player) <= team.treasury &&
            coachRng.rollDie(2) === 1;
          if (keep) keepDraftedPlayer(team, entry);
          else releaseDraftedPlayer(team, entry);
          log.push(
            `${team.name}: drafted ${player.playerName} ${keep ? "kept" : "released"}`
          );
          break;
        }
      }
    } catch (cause) {
      note(team.name, `development-${entry.kind}`, String(cause));
      team.pendingDevelopment = team.pendingDevelopment!.filter(
        (e) => e.id !== entry.id
      );
    }
    team.teamValue = calculateTeamValue(team);
    saveTeam(team);
  }
  spendSpp(team, log);
  hireUpToSeven(team, log);
}

/** Team Builder: a league team short of 7 hires Linemen from the Treasury. */
function hireUpToSeven(team: Team, log: string[]): void {
  if (!canEdit(team, { type: "hire-player" }).allowed) return;
  const template = getRosterByRosterName(team.rosterName).playerTemplates.find(
    (candidate) => candidate.keywords.includes(PositionKeyWord.LINEMAN)
  );
  if (!template) return;
  while (team.players.length < 7) {
    const price = priceOf(team, { type: "player", cost: template.cost });
    if (price.amount == null || team.treasury < price.amount) {
      happened(
        team.name,
        "cannot-refill",
        `${team.players.length} players, ${team.treasury} in the Treasury`
      );
      return;
    }
    const used = new Set(team.players.map((p) => p.number));
    let number = 1;
    while (used.has(number)) number++;
    const player = createPlayer(template, team.id, number);
    player.cost = price.amount;
    if (!addPlayerToTeam(team, player)) return;
    log.push(`${team.name}: hired ${player.playerName}`);
  }
  team.teamValue = calculateTeamValue(team);
  saveTeam(team);
}

/** A6: a pro team's offer the empty Treasury could not match. */
function draftedAway(team: Team, released: { playerName: string }[]): void {
  for (const record of released)
    happened(
      team.name,
      "drafted-away",
      `${record.playerName}, Treasury ${team.treasury}`
    );
}

function resolveSkillSelection(
  team: Team,
  entry: Extract<
    NonNullable<Team["pendingDevelopment"]>[number],
    { kind: "sevens-skill-selection" }
  >,
  log: string[]
): void {
  const wantSecondary = coachRng.rollDie(3) === 1;
  for (let step = 0; step < 10; step++) {
    if (!team.pendingDevelopment?.some((e) => e.id === entry.id)) return;
    const decision = skillSelectionDecision(team, entry);
    switch (decision.type) {
      case "choose-route": {
        if (
          (wantSecondary || decision.primaryOptions.length === 0) &&
          decision.secondaryAvailable
        ) {
          startSecondarySelection(team, entry, coachRng);
        } else if (decision.primaryOptions.length > 0) {
          const option =
            decision.primaryOptions[
              coachRng.rollDie(decision.primaryOptions.length) - 1
            ];
          startPrimarySelection(
            team,
            entry,
            option.playerId,
            option.categories[0]
          );
        } else {
          note(team.name, "skill-selection-stuck", "no route is available");
          return;
        }
        break;
      }
      case "name-primary-skill":
        nominatePrimarySkill(
          team,
          entry,
          decision.chooser,
          decision.options[coachRng.rollDie(decision.options.length) - 1]
        );
        break;
      case "roll-primary-d3": {
        const result = rollPrimarySelection(team, entry, coachRng);
        log.push(
          `${team.name}: Skill Selection primary ${result.skill} (D3 ${result.d3})`
        );
        draftedAway(team, result.draft.released);
        return;
      }
      case "choose-secondary-category":
        rollSecondaryCandidates(team, entry, decision.categories[0], coachRng);
        break;
      case "choose-secondary-skill": {
        const result = chooseSecondarySkill(
          team,
          entry,
          decision.candidates[0].skill,
          coachRng
        );
        log.push(`${team.name}: Skill Selection secondary ${result.skill}`);
        draftedAway(team, result.draft.released);
        return;
      }
    }
  }
  note(team.name, "skill-selection-stuck", "ten steps without finishing");
}

// ===== CompetitionView launch, GamePage, results screen =====

let nextSeed = 1;

async function playFixture(
  competitionId: string,
  type: "league" | "tournament",
  fixture: CompetitionFixture
): Promise<"recorded" | "unrecorded"> {
  const competition = (await getCompetition(type, competitionId))!;
  const entrant = (id: string | null) =>
    competition.entrants.find((e) => e.id === id)!;
  const homeEntrant = entrant(fixture.homeEntrantId);
  const awayEntrant = entrant(fixture.awayEntrantId);
  const where = `${competition.name} ${fixture.id}`;
  const home = mustLoad(homeEntrant.teamId);
  const away = mustLoad(awayEntrant.teamId);
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
  // CompetitionView marks a knockout bracket's fixtures; a draw goes on
  const knockout =
    competition.type === "tournament" &&
    competition.format === "single-elimination";
  const game = new HeadlessGame({
    seed,
    team1: home,
    team2: away,
    startingPhase: GamePhase.SETUP,
    progressionEnabled: PROGRESSION,
    knockout,
  });
  checkKickoff(where, game, before);
  // GamePage records the result the moment the phase reaches GAME_OVER
  const recording = await runMatch({
    seed,
    rosters: [home.rosterName, away.rosterName],
    coaches: [heuristicCoach, heuristicCoach],
    game,
  });
  for (const finding of recording.findings)
    note(where, `match-${finding.kind}`, `${finding.rule}: ${finding.message}`);
  const state = game.ctx.gameService.getState();
  const homeScore = state.score[home.id] ?? 0;
  const awayScore = state.score[away.id] ?? 0;
  const live = {
    home: game.ctx.gameService.getTeam(home.id) ?? home,
    away: game.ctx.gameService.getTeam(away.id) ?? away,
  };
  let recorded = true;
  let winnerTeamId: string | undefined;
  if (state.phase !== GamePhase.GAME_OVER) {
    note(where, "match-unfinished", `ended in ${state.phase}`);
    recorded = false;
  } else {
    try {
      const penalties = state.result?.penalties;
      if (penalties)
        happened(
          where,
          "penalties",
          `${homeScore}-${awayScore}, shoot-out ${penalties[home.id]}-${penalties[away.id]}`
        );
      const updated = await recordCompetitionFixture(
        {
          competitionType: type,
          competitionId,
          fixtureId: fixture.id,
          knockout,
        },
        homeScore,
        awayScore,
        live,
        penalties && {
          home: penalties[home.id] ?? 0,
          away: penalties[away.id] ?? 0,
        }
      );
      winnerTeamId = updated.entrants.find(
        (e) =>
          e.id ===
          updated.fixtures.find((f) => f.id === fixture.id)?.result
            ?.winnerEntrantId
      )?.teamId;
    } catch (cause) {
      recorded = false;
      note(where, "record-failed", `${homeScore}-${awayScore}: ${cause}`);
    }
  }
  const afterRecord = new Map(
    [home, away].map((team) => [team.id, structuredClone(mustLoad(team.id))])
  );

  // MatchResultsScreen: MVP, confirm SPP, record pending development
  const tracker = game.ctx.matchStats;
  const sppEarned: Record<string, number> = {};
  if (tracker.progressionEnabled) {
    const teams = [live.home, live.away];
    for (const team of teams) {
      const nominees = tracker.getEligibleMvpPlayers(team.id).slice(0, 6);
      if (nominees.length === 0) continue;
      tracker.awardMvp(team.id, nominees, coachRng.rollDie(nominees.length));
    }
    const concedingTeamId =
      state.result?.reason === "concession"
        ? state.result.concedingTeamId
        : undefined;
    const summary = tracker.applySpp(teams, concedingTeamId);
    foldMatchSummaryIntoCareers(teams, summary);
    for (const stats of summary.players)
      sppEarned[stats.playerId] = stats.sppEarned;
    const matchId = `match-${seed}`;
    for (const team of teams) {
      const raisedId = state.raisedDead?.[team.id];
      if (raisedId) offerRaisedDeadRecruit(team, raisedId);
      if (team.advancementMode === "sevens-skill-selection") {
        const eligible = eligibleSkillSelectionPlayers(team);
        if (eligible.length > 0)
          createPendingSkillSelection(team, matchId, eligible);
      } else if (
        !team.advancementMode ||
        team.advancementMode === "advanced-league"
      ) {
        for (const player of team.players.filter(mustAdvance)) {
          team.pendingDevelopment ??= [];
          if (
            !team.pendingDevelopment.some(
              (e) =>
                e.kind === "advanced-league-advancement" &&
                e.playerId === player.id
            )
          )
            team.pendingDevelopment.push({
              id: `pending-${matchId}-${player.id}`,
              kind: "advanced-league-advancement",
              playerId: player.id,
              createdAt: Date.now(),
            });
        }
      }
      team.teamValue = calculateTeamValue(team);
      stampFirstCompletedMatch(team);
      keepRecordedResult(team);
      saveTeam(team);
    }
  }

  checkAfterMatch(
    where,
    competition,
    fixture,
    before,
    afterRecord,
    {
      [home.id]: [homeScore, awayScore],
      [away.id]: [awayScore, homeScore],
    },
    sppEarned,
    recorded,
    winnerTeamId
  );

  const development: string[] = [];
  for (const team of [home, away]) resolveDevelopment(team.id, development);
  for (const team of [home, away]) checkTeam(where, mustLoad(team.id));

  fixtures.push({
    competition: competition.name,
    fixture: fixture.id,
    home: home.name,
    away: away.name,
    score: [homeScore, awayScore],
    seed,
    commands: recording.steps.length,
    recorded,
    spp: Object.fromEntries(
      [home, away].map((team) => [
        team.name,
        team.players.reduce((sum, p) => sum + (sppEarned[p.id] ?? 0), 0),
      ])
    ),
    development,
  });
  return recorded ? "recorded" : "unrecorded";
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
  afterRecord: Map<string, Team>,
  scores: Record<string, [number, number]>,
  sppEarned: Record<string, number>,
  recorded: boolean,
  winnerTeamId: string | undefined
): void {
  const key = `${competition.id}:${fixture.id}`;
  for (const [teamId, previous] of before) {
    const now = mustLoad(teamId);
    const [own, other] = scores[teamId];
    if (recorded && own !== other && !winnerTeamId)
      note(
        where,
        "winner",
        `${now.name}: ${own}-${other} recorded without a winner`
      );
    const expect = recorded
      ? {
          wins: (previous.wins ?? 0) + (winnerTeamId === teamId ? 1 : 0),
          draws: (previous.draws ?? 0) + (winnerTeamId ? 0 : 1),
          losses:
            (previous.losses ?? 0) +
            (winnerTeamId && winnerTeamId !== teamId ? 1 : 0),
          touchdowns: (previous.touchdowns ?? 0) + own,
        }
      : {
          wins: previous.wins ?? 0,
          draws: previous.draws ?? 0,
          losses: previous.losses ?? 0,
          touchdowns: previous.touchdowns ?? 0,
        };
    for (const field of ["wins", "draws", "losses", "touchdowns"] as const) {
      if ((afterRecord.get(teamId)![field] ?? 0) !== expect[field])
        note(
          where,
          `record-${field}`,
          `${now.name} after recording: ${afterRecord.get(teamId)![field]}, expected ${expect[field]}`
        );
      if ((now[field] ?? 0) !== expect[field])
        note(
          where,
          `record-${field}-after-results`,
          `${now.name} after the results screen: ${now[field]}, expected ${expect[field]}`
        );
    }
    const ids = now.recordedFixtureIds ?? [];
    if (recorded && ids.filter((id) => id === key).length !== 1)
      note(
        where,
        "recorded-fixture-id",
        `${now.name} holds ${key} ${ids.filter((id) => id === key).length} times`
      );
    for (const player of previous.players) {
      const stored = now.players.find((p) => p.id === player.id);
      if (!stored) continue;
      const expected = (player.spp ?? 0) + (sppEarned[player.id] ?? 0);
      if ((stored.spp ?? 0) !== expected)
        note(
          where,
          "spp-persisted",
          `${now.name} ${player.playerName}: ${stored.spp}, expected ${expected}`
        );
    }
    if (
      recorded &&
      competition.status === "active" &&
      now.firstMatchPlayedAt == null
    )
      note(
        where,
        "first-match-stamp",
        `${now.name} is still a draft team after a recorded match`
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

    for (let season = 1; season <= SEASONS; season++) {
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
            progression: PROGRESSION,
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
