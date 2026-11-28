import type { IGameService } from "../../services/interfaces/IGameService";
import type { Player } from "../../types/Player";
import { playerById } from "../seating";
import {
  type Contact,
  type Lent,
  NONE_LENT,
  crossAssistOffers,
} from "../validators/crossAssists";

export async function lendAssists(
  game: IGameService,
  contact: Contact
): Promise<Lent> {
  const seating = game.getSeating();
  const offered = crossAssistOffers(seating, contact);
  if (offered.length === 0) return NONE_LENT;
  const attacker: Player[] = [];
  const defender: Player[] = [];
  for (const { teamId, offers } of offered) {
    const { pledges } = await game.getDecisionService().request({
      type: "cross-assist",
      chooserTeamId: teamId,
      attackerId: contact.attacker.id,
      defenderId: contact.defender.id,
      action: contact.action,
      offers,
    });
    for (const { playerId, side } of pledges) {
      const player = playerById(seating, playerId);
      if (player) (side === "attacker" ? attacker : defender).push(player);
    }
  }
  return { attacker, defender };
}
