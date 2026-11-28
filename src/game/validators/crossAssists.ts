import type { Player } from "../../types/Player";
import type { BlockAnalysis } from "../../types/Actions";
import type { AssistSide, CrossAssistOffer } from "../../types/decisions";
import { everyone, rivalsOf, type Seating } from "../seating";
import { lendsAssist } from "./AssistValidator";
import { blockDiceForStrength } from "./BlockValidator";

export interface Contact {
  readonly attacker: Player;
  readonly defender: Player;
  readonly action: "block" | "foul";
  readonly activeTeamId: string | null;
}

export interface Lent {
  readonly attacker: readonly Player[];
  readonly defender: readonly Player[];
}

export const NONE_LENT: Lent = { attacker: [], defender: [] };

const SIDES: readonly AssistSide[] = ["attacker", "defender"];

function sidesFor(
  player: Player,
  contact: Contact,
  allPlayers: readonly Player[]
): AssistSide[] {
  const { attacker, defender, action, activeTeamId } = contact;
  return SIDES.filter((side) =>
    lendsAssist({
      assister: player,
      opponent: side === "attacker" ? defender : attacker,
      involved: [attacker.id, defender.id],
      allPlayers,
      action,
      activeTeamId,
    })
  );
}

export function crossAssistOffers(
  seating: Seating,
  contact: Contact
): { teamId: string; offers: CrossAssistOffer[] }[] {
  const { attacker, defender } = contact;
  if (attacker.teamId === defender.teamId) return [];
  const allPlayers = everyone(seating);
  return rivalsOf(seating, attacker.teamId)
    .filter(({ team }) => team.id !== defender.teamId)
    .map(({ team }) => ({
      teamId: team.id,
      offers: team.players
        .map((player) => ({
          playerId: player.id,
          sides: sidesFor(player, contact, allPlayers),
        }))
        .filter(({ sides }) => sides.length > 0),
    }))
    .filter(({ offers }) => offers.length > 0);
}

export function lentCount(lent: Lent): number {
  return lent.attacker.length + lent.defender.length;
}

export function withLent(analysis: BlockAnalysis, lent: Lent): BlockAnalysis {
  if (lentCount(lent) === 0) return analysis;
  const attackerST = analysis.attackerST + lent.attacker.length;
  const defenderST = analysis.defenderST + lent.defender.length;
  return {
    ...analysis,
    ...blockDiceForStrength(attackerST, defenderST),
    attackerST,
    defenderST,
    attackerAssists: [...analysis.attackerAssists, ...lent.attacker],
    defenderAssists: [...analysis.defenderAssists, ...lent.defender],
  };
}
