/**
 * Hiring Journeymen for good after a league game (step 4 of the post-game
 * sequence). They are taken on at kick-off by leagueRoster.ts. The spec is
 * openspec/specs/league-treasury/spec.md.
 *
 * 2025 rulebook (rulespal.com, blood-bowl-third-season): "Hire any
 * Journeymen that played for your team during the game. To hire a
 * Journeyman, they will cost their Hiring Fee, plus any Value Increase they
 * gained from advancements, in gold pieces. A hired Journeyman will lose the
 * Loner (X+) Trait and will retain any SPP gained during the game. From
 * then on they will simply become another player. Any Journeymen not hired
 * are permanently lost." Second Season: "A team must have fewer than 16
 * players on its Team Draft list to permanently hire Journeymen", where
 * Sevens allows 11.
 */

import { getRosterByRosterName } from "../../data/RosterTemplates";
import { InjuryType, Player } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import {
  PendingDevelopment,
  Team,
  calculateTeamValue,
  isLeagueMode,
  playerValue,
} from "../../types/Team";
import { hireRefusal } from "./teamPricing";
import { ROSTER_SLOTS, freeRosterNumber } from "./playerSlots";

export type JourneymanOffer = Extract<
  PendingDevelopment,
  { kind: "journeyman-offer" }
>;

/**
 * After a game, offer each Journeyman who played a league fixture for good;
 * every other Journeyman leaves now. One already waiting on an earlier
 * offer keeps it. A dead Journeyman leaves like any dead player.
 */
export function offerJourneymen(
  team: Team,
  matchId: string,
  game: {
    /** The game was a league fixture (`GameState.paysWinnings`). */
    leagueFixture: boolean;
    /** Who took part, when known (MatchStats participation). */
    playedIds?: ReadonlySet<string>;
  }
): void {
  const offered = new Set(
    (team.pendingDevelopment ?? [])
      .filter((entry) => entry.kind === "journeyman-offer")
      .map((entry) => (entry as JourneymanOffer).playerId)
  );
  const fresh = team.players.filter(
    (player) => player.playerKind === "journeyman" && !offered.has(player.id)
  );
  const staying = new Set<string>();
  for (const player of fresh) {
    if (
      game.leagueFixture &&
      isLeagueMode(team.advancementMode) &&
      (game.playedIds?.has(player.id) ?? true) &&
      !player.injuries.includes(InjuryType.DEAD)
    ) {
      staying.add(player.id);
      team.pendingDevelopment ??= [];
      team.pendingDevelopment.push({
        id: `journeyman-${matchId}-${player.id}`,
        kind: "journeyman-offer",
        playerId: player.id,
        matchId,
        createdAt: Date.now(),
      });
    }
  }
  const leaving = new Set(
    fresh.filter((player) => !staying.has(player.id)).map((p) => p.id)
  );
  if (leaving.size > 0) {
    team.players = team.players.filter((player) => !leaving.has(player.id));
  }
}

/** The price to hire a Journeyman: Hiring Fee plus any Value Increase. */
export function journeymanPrice(player: Player): number {
  return playerValue(player);
}

/**
 * Why this Journeyman cannot be hired now (no room on the Team Draft List,
 * or not enough gold), or undefined when they can.
 */
export function journeymanHireRefusal(
  team: Team,
  entry: JourneymanOffer
): string | undefined {
  const player = team.players.find((p) => p.id === entry.playerId);
  if (!player) return "This Journeyman has already left.";
  const template = getRosterByRosterName(team.rosterName).playerTemplates.find(
    (candidate) => candidate.positionName === player.positionName
  );
  if (!template) return `${player.positionName} is not on the roster.`;
  const refusal = hireRefusal(team, template, player.id);
  if (refusal) return refusal;
  if ((team.treasury ?? 0) < journeymanPrice(player)) {
    return "Not enough gold in the treasury.";
  }
  return undefined;
}

/**
 * Hire a Journeyman for good: pay their price from the Treasury, drop the
 * Loner (5+) they played with, and keep their SPP and advancements. Throws
 * with the reason when refused, leaving the team unchanged.
 */
export function hireJourneyman(team: Team, entry: JourneymanOffer): number {
  if (!team.pendingDevelopment?.some((pending) => pending.id === entry.id)) {
    throw new Error("This Journeyman offer has already been answered.");
  }
  const refusal = journeymanHireRefusal(team, entry);
  if (refusal) throw new Error(refusal);
  const player = team.players.find((p) => p.id === entry.playerId)!;
  const template = getRosterByRosterName(team.rosterName).playerTemplates.find(
    (candidate) => candidate.positionName === player.positionName
  )!;
  const price = journeymanPrice(player);
  team.treasury -= price;
  player.playerKind = "roster";
  // Taken on above the 11 roster slots, they move to a free one
  const slot = player.number > ROSTER_SLOTS ? freeRosterNumber(team) : null;
  if (slot !== null) player.number = slot;
  // A Lineman whose own profile has Loner keeps it
  player.skills = [
    ...player.skills.filter((skill) => skill.type !== SkillType.LONER),
    ...template.skills.filter((skill) => skill.type === SkillType.LONER),
  ];
  team.pendingDevelopment = team.pendingDevelopment.filter(
    (pending) => pending.id !== entry.id
  );
  team.teamValue = calculateTeamValue(team);
  return price;
}

/**
 * Let a Journeyman go: they leave with their SPP and advancements, and any
 * development waiting on them goes too.
 */
export function releaseJourneyman(team: Team, entry: JourneymanOffer): void {
  team.players = team.players.filter((player) => player.id !== entry.playerId);
  team.pendingDevelopment = (team.pendingDevelopment ?? []).filter(
    (pending) =>
      pending.id !== entry.id &&
      !("playerId" in pending && pending.playerId === entry.playerId)
  );
  team.teamValue = calculateTeamValue(team);
}
