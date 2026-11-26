import { getRosterByRosterName } from "../../data/RosterTemplates";
import { InjuryType, type Player } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import {
  type PendingDevelopment,
  type Team,
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

export function offerJourneymen(
  team: Team,
  matchId: string,
  game: {
    leagueFixture: boolean;

    playedIds?: ReadonlySet<string>;
  }
): void {
  const offered = new Set(
    (team.pendingDevelopment ?? [])
      .filter((entry) => entry.kind === "journeyman-offer")
      .map((entry) => entry.playerId)
  );
  const fresh = team.players.filter(
    (player) => player.playerKind === "journeyman" && !offered.has(player.id)
  );
  const staying = new Set<string>();
  for (const player of fresh) {
    if (!(game.leagueFixture &&
      isLeagueMode(team.advancementMode) &&
      (game.playedIds?.has(player.id) ?? true)) || player.injuries.includes(InjuryType.DEAD)) {
      continue;
    }

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
  const leaving = new Set(
    fresh.filter((player) => !staying.has(player.id)).map((p) => p.id)
  );
  if (leaving.size > 0) {
    team.players = team.players.filter((player) => !leaving.has(player.id));
  }
}

export function journeymanPrice(player: Player): number {
  return playerValue(player);
}

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

  const slot = player.number > ROSTER_SLOTS ? freeRosterNumber(team) : null;
  if (slot !== null) player.number = slot;

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

export function releaseJourneyman(team: Team, entry: JourneymanOffer): void {
  team.players = team.players.filter((player) => player.id !== entry.playerId);
  team.pendingDevelopment = (team.pendingDevelopment ?? []).filter(
    (pending) =>
      pending.id !== entry.id &&
      !("playerId" in pending && pending.playerId === entry.playerId)
  );
  team.teamValue = calculateTeamValue(team);
}
