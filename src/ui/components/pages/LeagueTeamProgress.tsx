import { useNavigate } from "react-router-dom";
import { type CompetitionDoc } from "../../../competition/types";
import { getTeamById } from "../../../game/managers/TeamManager";
import { canAdvance, mustAdvance } from "../../../game/progression/progression";
import { hasBlockingPendingDevelopment, type Team } from "../../../types/Team";
import { TeamCrest } from "../common/TeamCrest";
import { Chip, HudButton, Section } from "../componentWarehouse/HudKit";
import type { HudTone } from "../componentWarehouse/hudTone";

type LeagueTeamStatus =
  | { kind: "computer" }
  | { kind: "development"; blocksNextGame: boolean }
  | { kind: "can-advance"; players: number }
  | { kind: "up-to-date" };

export interface LeagueTeamProgressRow {
  team: Team;
  status: LeagueTeamStatus;
}

export function leagueTeamProgressRows(
  competition: CompetitionDoc,
  findTeam: (teamId: string) => Team | undefined = getTeamById
): LeagueTeamProgressRow[] {
  const rows: LeagueTeamProgressRow[] = [];
  for (const entrant of competition.entrants) {
    if (entrant.withdrawn) continue;
    const team = findTeam(entrant.teamId);
    if (!team) continue;
    rows.push({
      team,
      status: statusOf(team, entrant.computerCoached, competition),
    });
  }
  return rows;
}

function statusOf(
  team: Team,
  computerEntrant: boolean | undefined,
  competition: CompetitionDoc
): LeagueTeamStatus {
  if (computerEntrant || team.computerCoached) return { kind: "computer" };
  if (hasBlockingPendingDevelopment(team) || team.players.some(mustAdvance)) {
    return {
      kind: "development",
      blocksNextGame:
        !!competition.rosterProfile?.requireDevelopmentComplete &&
        hasBlockingPendingDevelopment(team),
    };
  }
  const players = team.players.filter(canAdvance).length;
  return players > 0
    ? { kind: "can-advance", players }
    : { kind: "up-to-date" };
}

function statusCopy(status: LeagueTeamStatus): {
  chip: string;
  tone: HudTone;
  detail: string;
} {
  switch (status.kind) {
    case "computer":
      return {
        chip: "Computer",
        tone: "neutral",
        detail: "The computer makes this team's development choices.",
      };
    case "development":
      return {
        chip: "Development to finish",
        tone: "warn",
        detail: status.blocksNextGame
          ? "Finish it before this team's next league game."
          : "Finish it on the team's page.",
      };
    case "can-advance":
      return {
        chip: `${String(status.players)} ${status.players === 1 ? "player" : "players"} can advance`,
        tone: "info",
        detail: "Spend Star Player Points on the team's page.",
      };
    case "up-to-date":
      return {
        chip: "Up to date",
        tone: "good",
        detail: "No development is waiting.",
      };
  }
}

export function progressTeamPath(teamId: string, leagueId: string): string {
  const params = new URLSearchParams({ returnTo: `/leagues/${leagueId}` });
  return `/build-team/${encodeURIComponent(teamId)}?${params}`;
}

export function LeagueTeamProgress({
  competition,
}: {
  competition: CompetitionDoc;
}) {
  const navigate = useNavigate();
  if (competition.type !== "league") return null;
  const rows = leagueTeamProgressRows(competition);
  if (rows.length === 0) return null;
  return (
    <Section title="Your teams" accent="gold">
      <ul className="grid gap-3 md:grid-cols-2" data-testid="league-your-teams">
        {rows.map(({ team, status }) => {
          const copy = statusCopy(status);
          return (
            <li
              key={team.id}
              className="flex flex-wrap items-center gap-3 rounded-hud border border-white/15 bg-black/30 px-3 py-3"
            >
              <TeamCrest name={team.name} colors={team.colors} size="lg" />
              <div className="min-w-0 flex-1">
                <h3 className="break-words font-hud-display text-hud-xl uppercase tracking-[0.02em] text-hud-bone">
                  {team.name}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Chip tone={copy.tone}>{copy.chip}</Chip>
                  <span className="text-hud-sm text-hud-dim">
                    {copy.detail}
                  </span>
                </div>
              </div>
              {status.kind !== "computer" && (
                <HudButton
                  variant={status.kind === "up-to-date" ? "secondary" : "gold"}
                  size="sm"
                  aria-label={`Progress team: ${team.name}`}
                  onClick={() =>
                    navigate(progressTeamPath(team.id, competition.id))
                  }
                >
                  Progress team
                </HudButton>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
