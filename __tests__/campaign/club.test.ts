import { fixtureValue } from "../../src/testing/fixtureValue";
import { writeFileSync } from "node:fs";
import { env } from "node:process";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createComputerTeam } from "../fixtures/computerTeam";
import { createCompetition } from "../../src/competition/create";
import { getCompetition } from "../../src/competition/repository";
import { createRosterRuleProfile } from "../../src/competition/rosterRules";
import { simulateFixture } from "../../src/competition/simulateFixture";
import type { CompetitionDoc, CompetitionType } from "../../src/competition/types";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { getTeamById, saveTeam } from "../../src/game/managers/TeamManager";
import {
  clubWorth,
  gutterSpecialist,
  gutterSpecialistRefusal,
  gutterUnlocked,
  hireGutterSpecialist,
} from "../../src/game/rules/club";
import { draftRulesFor } from "../../src/game/rules/draftRules";
import type { GameType } from "../../src/game/variants/gameTypes";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import { RNGService } from "../../src/services/rng/RNGService";
import { PositionKeyWord } from "../../src/types/Player";
import { RosterName, type Team, calculateTeamValue } from "../../src/types/Team";

const CLUBS = [
  RosterName.DARK_ELF,
  RosterName.HUMAN,
  RosterName.ORC,
  RosterName.SKAVEN,
  RosterName.WOOD_ELF,
  RosterName.DWARF,
  RosterName.LIZARDMEN,
  RosterName.CHAOS_CHOSEN,
];

const SCHEDULE: { type: CompetitionType; gameType: GameType }[] = [
  { type: "league", gameType: "sevens" },
  { type: "tournament", gameType: "street-bowl" },
  { type: "league", gameType: "beach-bowl" },
  { type: "tournament", gameType: "gutter-bowl" },
  { type: "league", gameType: "street-bowl" },
  { type: "tournament", gameType: "sevens" },
  { type: "league", gameType: "gutter-bowl" },
  { type: "tournament", gameType: "beach-bowl" },
];

const TARGET_GAMES = Number(env["CLUB_GAMES"] ?? "40");

interface Snapshot {
  club: string;
  roster: string;
  game: number;
  competition: string;
  gameType: GameType;
  score: [number, number];
  outcome: "win" | "draw" | "loss";
  winnings: number;
  teamValue: number;
  treasury: number;
  worth: number;
  gutterUnlocked: boolean;
  specialist: string | null;
  players: number;
  lostSoFar: number;
  sppEarned: number;
  sppHeld: number;
  advancements: number;
  rerolls: number;
  apothecary: boolean;
}

interface Finding {
  where: string;
  rule: string;
  detail: string;
}

const findings: Finding[] = [];
const engineFindings: Finding[] = [];
const events: Finding[] = [];
const snapshots: Snapshot[] = [];
const competitions: { name: string; gameType: GameType; type: CompetitionType; entrants: string[] }[] = [];
const gamesPlayed = new Map<string, number>();
const everSeen = new Map<string, Set<string>>();
const coachRng = new RNGService(20_261_122);
let nextSeed = 1;

function note(where: string, rule: string, detail: string): void {
  findings.push({ where, rule, detail });
}

function mustLoad(teamId: string): Team {
  return fixtureValue(getTeamById(teamId));
}

function foundClubs(): string[] {
  return CLUBS.map((rosterName, index) => {
    const team = createComputerTeam({
      rosterName,
      name: `${rosterName} Club`,
      primaryColour: 0x224488 + index * 0x331100,
      advancementMode: "advanced-league",
    });
    team.club = {};
    void saveTeam(team);
    everSeen.set(team.id, new Set(team.players.map((player) => player.id)));
    return team.id;
  });
}

function checkSquad(where: string, gameType: GameType, game: HeadlessGame): void {
  const draft = draftRulesFor(gameType);
  for (const team of [game.ctx.team1, game.ctx.team2]) {
    const stored = mustLoad(team.id);
    const specialist = gutterSpecialist(stored);
    const inMatch = new Set(team.players.map((player) => player.id));
    if (specialist && gameType !== "gutter-bowl" && inMatch.has(specialist.id))
      note(where, "specialist-played", `${team.name}: ${specialist.playerName} played ${gameType}`);
    if (team.apothecary && !draft.apothecary)
      note(where, "staff-played", `${team.name} brought an Apothecary to ${gameType}`);
    const hired = team.players.filter((player) => player.playerKind !== "journeyman");
    if (hired.length > draft.maxPlayers)
      note(where, "squad-size", `${team.name} fielded a squad of ${String(hired.length)}`);
    const positionals = hired.filter((p) => !p.keywords.includes(PositionKeyWord.LINEMAN));
    if (positionals.length > draft.maxNonLinemen)
      note(where, "positionals", `${team.name}: ${String(positionals.length)} positionals in ${gameType}`);
  }
}

function hireSpecialists(where: string, clubIds: string[]): void {
  for (const id of clubIds) {
    const team = mustLoad(id);
    if (!gutterUnlocked(team) || gutterSpecialist(team)) continue;
    const positionals = getRosterByRosterName(team.rosterName)
      .playerTemplates.filter((template) => !template.keywords.includes(PositionKeyWord.LINEMAN))
      .filter((template) => gutterSpecialistRefusal(team, template) === undefined)
      .sort((a, b) => b.cost - a.cost);
    const [best] = positionals;
    if (!best) continue;
    const result = hireGutterSpecialist(team, best);
    if (!result.hired) continue;
    everSeen.get(id)?.add(result.player.id);
    void saveTeam(team);
    events.push({
      where,
      rule: "specialist-hired",
      detail: `${team.name}: ${best.positionName} for ${String(best.cost)} after ${String(gamesPlayed.get(id) ?? 0)} games`,
    });
  }
}

function lostPlayers(team: Team): number {
  const seen = everSeen.get(team.id) ?? new Set<string>();
  for (const player of team.players)
    if (player.playerKind !== "journeyman") seen.add(player.id);
  everSeen.set(team.id, seen);
  const present = new Set(team.players.map((player) => player.id));
  return [...seen].filter((id) => !present.has(id)).length;
}

function outcomeOf(own: number, other: number): Snapshot["outcome"] {
  if (own === other) return "draw";
  return own > other ? "win" : "loss";
}

function snapshot(
  team: Team,
  context: { competition: CompetitionDoc; gameType: GameType; score: [number, number]; winnings: number; sppEarned: number }
): void {
  const game = (gamesPlayed.get(team.id) ?? 0) + 1;
  gamesPlayed.set(team.id, game);
  const [own, other] = context.score;
  const specialist = gutterSpecialist(team);
  snapshots.push({
    club: team.name,
    roster: team.rosterName,
    game,
    competition: context.competition.name,
    gameType: context.gameType,
    score: context.score,
    outcome: outcomeOf(own, other),
    winnings: context.winnings,
    teamValue: calculateTeamValue(team),
    treasury: team.treasury,
    worth: clubWorth(team),
    gutterUnlocked: gutterUnlocked(team),
    specialist: specialist ? specialist.positionName : null,
    players: team.players.filter((player) => player.playerKind !== "journeyman").length,
    lostSoFar: lostPlayers(team),
    sppEarned: context.sppEarned,
    sppHeld: team.players.reduce((sum, player) => sum + player.spp, 0),
    advancements: team.players.reduce((sum, player) => sum + (player.advancements?.length ?? 0), 0),
    rerolls: team.rerolls,
    apothecary: team.apothecary,
  });
}

async function playCompetition(competition: CompetitionDoc, gameType: GameType, clubIds: string[]): Promise<void> {
  for (let guard = 0; guard < 200; guard++) {
    const latest = fixtureValue(await getCompetition(competition.type, competition.id));
    const fixture = latest.fixtures.find((f) => f.status !== "complete" && f.homeEntrantId && f.awayEntrantId);
    if (!fixture) return;
    const where = `${latest.name} ${fixture.id}`;
    const entrant = (entrantId: string | null) => fixtureValue(latest.entrants.find((e) => e.id === entrantId));
    const homeId = entrant(fixture.homeEntrantId).teamId;
    const awayId = entrant(fixture.awayEntrantId).teamId;
    const specialists = [homeId, awayId].map((id) => gutterSpecialist(mustLoad(id))?.id);
    let outcome: Awaited<ReturnType<typeof simulateFixture>>;
    try {
      outcome = await simulateFixture(latest, fixture.id, {
        seed: nextSeed++,
        rng: coachRng,
        inspect: (game) => {
          checkSquad(where, gameType, game);
        },
      });
    } catch (cause) {
      note(where, "simulation-failed", String(cause));
      return;
    }
    for (const finding of outcome.recording.findings)
      engineFindings.push({ where, rule: `match-${finding.kind}`, detail: `${finding.key}: ${finding.message}` });
    const result = fixtureValue(outcome.fixture.result);
    [homeId, awayId].forEach((id, index) => {
      const team = mustLoad(id);
      const specialistId = specialists[index];
      if (specialistId && team.players.every((player) => player.id !== specialistId) && gameType !== "gutter-bowl")
        note(where, "specialist-lost", `${team.name} lost its specialist after a ${gameType} match`);
      const home = index === 0;
      snapshot(team, {
        competition: latest,
        gameType,
        score: home ? [result.homeScore, result.awayScore] : [result.awayScore, result.homeScore],
        winnings: (home ? result.winnings?.home : result.winnings?.away) ?? 0,
        sppEarned: team.players.reduce((sum, player) => sum + (outcome.sppEarned[player.id] ?? 0), 0),
      });
    });
    hireSpecialists(where, clubIds);
  }
}

async function enter(slot: (typeof SCHEDULE)[number], index: number, clubIds: string[]): Promise<CompetitionDoc | null> {
  const name = `${String(index + 1)}. ${slot.gameType} ${slot.type}`;
  const eligible = clubIds.filter((id) => slot.gameType !== "gutter-bowl" || gutterUnlocked(mustLoad(id)));
  if (eligible.length < 4) {
    events.push({ where: name, rule: "skipped", detail: `${String(eligible.length)} clubs can play Gutter Bowl` });
    return null;
  }
  const entrants = slot.type === "tournament" && eligible.length < 8 ? eligible.slice(0, 4) : eligible;
  try {
    const competition = await createCompetition({
      type: slot.type,
      name,
      format: "single-elimination",
      gameType: slot.gameType,
      organizerUid: null,
      entrants: entrants.map((id) => ({ team: mustLoad(id), ownerUid: null })),
      profile: createRosterRuleProfile({ advancementMode: "advanced-league", draftBudget: 10_000_000 }),
    });
    competitions.push({
      name,
      gameType: slot.gameType,
      type: slot.type,
      entrants: entrants.map((id) => mustLoad(id).name),
    });
    return competition;
  } catch (cause) {
    note(name, "entry-refused", String(cause));
    return null;
  }
}

describe.runIf(env["CLUB_CAMPAIGN"] === "1")("a club campaign across every game type", () => {
  it("plays computer clubs through leagues and tournaments until each has played its games", async () => {
    localStorage.clear();
    const clubIds = foundClubs();
    const fewest = () => Math.min(...clubIds.map((id) => gamesPlayed.get(id) ?? 0));
    for (let index = 0; index < 40 && fewest() < TARGET_GAMES; index++) {
      const slot = fixtureValue(SCHEDULE[index % SCHEDULE.length]);
      const competition = await enter(slot, index, clubIds);
      if (!competition) continue;
      await playCompetition(competition, slot.gameType, clubIds);
      for (const id of clubIds) {
        if (mustLoad(id).activeCompetitionId)
          note(competition.name, "lock-kept", `${mustLoad(id).name} is still locked`);
      }
    }

    if (env["CLUB_OUT"]) {
      writeFileSync(
        env["CLUB_OUT"],
        JSON.stringify({ findings, engineFindings, events, competitions, snapshots }, null, 2)
      );
    }
    console.log(
      `club campaign: ${String(snapshots.length / 2)} fixtures, fewest games ${String(fewest())}, engine findings ${String(engineFindings.length)}`
    );
    expect(fewest()).toBeGreaterThanOrEqual(TARGET_GAMES);
    expect(findings).toEqual([]);
  }, 3_600_000);
});
