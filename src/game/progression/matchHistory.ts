import { type MatchResult } from "../../types/GameState";
import { type RosterName, type Team } from "../../types/Team";
import { findRosterName } from "../../data/RosterTemplates";
import { type PlayerMatchStats } from "./MatchStats";

export type PlayedGameKind = "online" | "computer" | "local";

export interface PlayedGamePlayer {
  playerId: string;
  name: string;
  number: number;
  touchdowns: number;
  casualties: number;
  completions: number;
  interceptions: number;
  mvp: boolean;

  injured: boolean;
}

export interface PlayedGame {
  id: string;
  playedAt: number;
  kind: PlayedGameKind;

  fixture?: string;
  opponent: { name: string; rosterName: RosterName };
  score: { own: number; opponent: number };
  outcome: "win" | "draw" | "loss";

  ending?: "conceded" | "forfeited" | "penalties";

  players: PlayedGamePlayer[];
}

export const PLAYED_GAMES_KEPT = 100;

function outcomeFor(
  team: Team,
  opponent: Team,
  own: number,
  theirs: number,
  result?: MatchResult
): Pick<PlayedGame, "outcome" | "ending"> {
  if (result?.reason === "concession" || result?.reason === "forfeit") {
    return {
      outcome: result.concedingTeamId === team.id ? "loss" : "win",
      ending: result.reason === "concession" ? "conceded" : "forfeited",
    };
  }
  if (own === theirs && result?.penalties) {
    const won = result.penalties[team.id] ?? 0;
    const lost = result.penalties[opponent.id] ?? 0;
    return { outcome: won > lost ? "win" : "loss", ending: "penalties" };
  }
  return { outcome: own > theirs ? "win" : own < theirs ? "loss" : "draw" };
}

function playedGamePlayer(
  team: Team,
  line: PlayerMatchStats
): PlayedGamePlayer | null {
  if (line.teamId !== team.id || !line.participated) return null;
  const player = team.players.find((p) => p.id === line.playerId);
  const injured = line.injuriesSuffered > 0;
  const scored =
    line.touchdowns + line.casualties + line.completions + line.interceptions;
  if (!player || (scored === 0 && line.mvps === 0 && !injured)) return null;
  return {
    playerId: player.id,
    name: player.playerName,
    number: player.number,
    touchdowns: line.touchdowns,
    casualties: line.casualties,
    completions: line.completions,
    interceptions: line.interceptions,
    mvp: line.mvps > 0,
    injured,
  };
}

export function playedGameFor(
  team: Team,
  opponent: Team,
  match: { score: Record<string, number>; result?: MatchResult },
  stats: PlayerMatchStats[],
  meta: { id: string; playedAt: number; kind: PlayedGameKind; fixture?: string }
): PlayedGame {
  const own = match.score[team.id] ?? 0;
  const theirs = match.score[opponent.id] ?? 0;
  const { outcome, ending } = outcomeFor(
    team,
    opponent,
    own,
    theirs,
    match.result
  );
  return {
    ...meta,
    opponent: { name: opponent.name, rosterName: opponent.rosterName },
    score: { own, opponent: theirs },
    outcome,
    ...(ending ? { ending } : {}),
    players: stats.flatMap((line) => playedGamePlayer(team, line) ?? []),
  };
}

export function storedPlayedGames(team: Team): { playedGames?: PlayedGame[] } {
  return team.playedGames ? { playedGames: team.playedGames } : {};
}

export function withPlayedGame(team: Team, game: PlayedGame): Team {
  const history = team.playedGames ?? [];
  if (history.some((entry) => entry.id === game.id)) return team;
  return {
    ...team,
    playedGames: [game, ...history].slice(0, PLAYED_GAMES_KEPT),
  };
}

const KINDS: readonly PlayedGameKind[] = ["online", "computer", "local"];
const OUTCOMES: readonly PlayedGame["outcome"][] = ["win", "draw", "loss"];
const ENDINGS: readonly NonNullable<PlayedGame["ending"]>[] = [
  "conceded",
  "forfeited",
  "penalties",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

function parsePlayer(raw: unknown): PlayedGamePlayer | null {
  if (!isRecord(raw) || typeof raw["playerId"] !== "string") return null;
  return {
    playerId: raw["playerId"],
    name: typeof raw["name"] === "string" ? raw["name"] : "",
    number: num(raw["number"]),
    touchdowns: num(raw["touchdowns"]),
    casualties: num(raw["casualties"]),
    completions: num(raw["completions"]),
    interceptions: num(raw["interceptions"]),
    mvp: raw["mvp"] === true,
    injured: raw["injured"] === true,
  };
}

export function parsePlayedGames(raw: unknown): PlayedGame[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): PlayedGame[] => {
    if (!isRecord(entry) || typeof entry["id"] !== "string") return [];
    const kind = KINDS.find((k) => k === entry["kind"]);
    const outcome = OUTCOMES.find((o) => o === entry["outcome"]);
    const ending = ENDINGS.find((e) => e === entry["ending"]);
    const opponent = isRecord(entry["opponent"]) ? entry["opponent"] : null;
    const rosterName = findRosterName(opponent?.["rosterName"]);
    const score = isRecord(entry["score"]) ? entry["score"] : null;
    if (!kind || !outcome || !opponent || !rosterName || !score) return [];
    return [
      {
        id: entry["id"],
        playedAt: num(entry["playedAt"]),
        kind,
        ...(typeof entry["fixture"] === "string"
          ? { fixture: entry["fixture"] }
          : {}),
        opponent: { name: String(opponent["name"] ?? ""), rosterName },
        score: { own: num(score["own"]), opponent: num(score["opponent"]) },
        outcome,
        ...(ending ? { ending } : {}),
        players: Array.isArray(entry["players"])
          ? entry["players"].flatMap((p) => parsePlayer(p) ?? [])
          : [],
      },
    ];
  });
}
