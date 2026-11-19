import { type Team, isPendingRecruit } from "../../types/Team";
import {
  type Player,
  type PlayerTemplate,
  createPlayer,
} from "../../types/Player";
import { isActiveTeam } from "./teamLifecycle";
import { staysOnRoster } from "./leagueRoster";
import {
  MAX_NON_LINEMEN,
  MAX_ROSTER_PLAYERS,
  isBigGuy,
  isLinemanPosition,
} from "./rosterLegality";
import { freeRosterNumber, uniquePlayerId } from "./playerSlots";
import { countInsignificant } from "./insignificant";
import { SkillType, hasSkill } from "../../types/Skills";
import { Inducement } from "../../types/Inducements";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { sevensInducementCatalog } from "../inducements/catalog";
import {
  APOTHECARY_COST,
  ASSISTANT_COACH_COST,
  CHEERLEADER_COST,
  DEDICATED_FAN_COST,
  MAX_ASSISTANT_COACHES,
  MAX_CHEERLEADERS,
  MAX_DEDICATED_FANS,
  MAX_TEAM_REROLLS,
  TEAM_REROLL_COST,
} from "./sevensPrices";

export type StaffItem =
  | { type: "reroll" }
  | { type: "apothecary" }
  | { type: "dedicated-fan" }
  | { type: "coach" }
  | { type: "cheerleader" }
  | { type: "inducement"; inducement: Inducement };

export type PriceableItem = StaffItem | { type: "player"; cost: number };

export interface PriceResult {
  amount: number | null;

  reason?: string;
}

function capped(
  count: number,
  max: number,
  amount: number,
  name: string
): PriceResult {
  return count >= max
    ? {
        amount: null,
        reason: `A team may have at most ${String(max)} ${name}.`,
      }
    : { amount };
}

export function priceOf(team: Team, item: PriceableItem): PriceResult {
  switch (item.type) {
    case "reroll":
      return capped(
        team.rerolls,
        MAX_TEAM_REROLLS,
        TEAM_REROLL_COST,
        "team re-rolls"
      );
    case "dedicated-fan":
      return capped(
        team.dedicatedFans,
        MAX_DEDICATED_FANS,
        DEDICATED_FAN_COST,
        "Dedicated Fans"
      );
    case "apothecary":
      if (!getRosterByRosterName(team.rosterName).apothecary) {
        return {
          amount: null,
          reason: `${team.rosterName} teams cannot hire an Apothecary.`,
        };
      }
      return team.apothecary
        ? { amount: null, reason: "A team may have only one Apothecary." }
        : { amount: APOTHECARY_COST };
    case "coach":
      return capped(
        team.coaches,
        MAX_ASSISTANT_COACHES,
        ASSISTANT_COACH_COST,
        "Assistant Coaches"
      );
    case "cheerleader":
      return capped(
        team.cheerleaders,
        MAX_CHEERLEADERS,
        CHEERLEADER_COST,
        "Cheerleaders"
      );
    case "inducement": {
      if (team.advancementMode !== "matched-play") {
        return {
          amount: null,
          reason: "Only Matched Play teams buy inducements at the draft.",
        };
      }
      if (isActiveTeam(team)) {
        return {
          amount: null,
          reason: "Inducements go on the draft list only at the draft.",
        };
      }
      const entry = sevensInducementCatalog(team).find(
        (line) => line.inducement === item.inducement
      );
      if (!entry) {
        return {
          amount: null,
          reason: `${team.rosterName} teams cannot buy ${item.inducement}.`,
        };
      }
      return capped(
        draftInducementCount(team, item.inducement),
        entry.maxCount,
        entry.price,
        item.inducement
      );
    }
    case "player":
      return { amount: item.cost };
  }
}

export function purchase(team: Team, item: StaffItem): PriceResult {
  const price = priceOf(team, item);
  if (price.amount == null) return price;
  if (team.treasury < price.amount) {
    return { amount: null, reason: "Not enough gold in the treasury." };
  }
  team.treasury -= price.amount;
  switch (item.type) {
    case "reroll":
      team.rerolls++;
      break;
    case "dedicated-fan":
      team.dedicatedFans++;
      break;
    case "apothecary":
      team.apothecary = true;
      break;
    case "coach":
      team.coaches++;
      break;
    case "cheerleader":
      team.cheerleaders++;
      break;
    case "inducement": {
      const lines = (team.draftInducements ??= []);
      const line = lines.find((l) => l.inducement === item.inducement);
      if (line) line.quantity++;
      else lines.push({ inducement: item.inducement, quantity: 1 });
      break;
    }
  }
  return price;
}

export function draftInducementCount(
  team: Team,
  inducement: Inducement
): number {
  return (
    team.draftInducements?.find((line) => line.inducement === inducement)
      ?.quantity ?? 0
  );
}

export function draftListPlayers(team: Team): Player[] {
  return team.players.filter(
    (player) =>
      staysOnRoster(team, player) && !isPendingRecruit(team, player.id)
  );
}

export interface PositionAllowance {
  hired: number;
  max: number;
}

export function positionAllowance(
  team: Team,
  template: PlayerTemplate
): PositionAllowance {
  const rosterLimit = Math.min(
    team.maxRosterSize ?? MAX_ROSTER_PLAYERS,
    MAX_ROSTER_PLAYERS
  );
  const caps = [template.maxAllowed ?? rosterLimit, rosterLimit];
  if (!isLinemanPosition(template.keywords)) caps.push(MAX_NON_LINEMEN);
  return {
    hired: draftListPlayers(team).filter(
      (player) => player.positionName === template.positionName
    ).length,
    max: Math.min(...caps),
  };
}

export function hireRefusal(
  team: Team,
  template: PlayerTemplate,

  joiningPlayerId?: string
): string | undefined {
  const listed = draftListPlayers(team).filter(
    (player) => player.id !== joiningPlayerId
  );
  const limit = Math.min(
    team.maxRosterSize ?? MAX_ROSTER_PLAYERS,
    MAX_ROSTER_PLAYERS
  );
  if (listed.length >= limit) {
    return `A Sevens team may have at most ${String(limit)} permanently hired players.`;
  }
  if (
    joiningPlayerId === undefined &&
    team.players.filter((player) => staysOnRoster(team, player)).length >= limit
  ) {
    return `A Sevens team may have at most ${String(limit)} players, counting a Journeyman or recruit still waiting on a hiring decision.`;
  }
  if (!isActiveTeam(team)) return undefined;
  return compositionRefusal(team, template, listed);
}

function compositionRefusal(
  team: Team,
  template: PlayerTemplate,
  listed: Player[]
): string | undefined {
  const ofPosition = listed.filter(
    (player) => player.positionName === template.positionName
  ).length;
  if (template.maxAllowed !== undefined && ofPosition >= template.maxAllowed) {
    return `${template.positionName}: the ${team.rosterName} roster allows 0-${String(template.maxAllowed)}, and this team has ${String(ofPosition)}.`;
  }
  const { maxBigGuys } = getRosterByRosterName(team.rosterName);
  if (
    maxBigGuys !== undefined &&
    isBigGuy(template.keywords) &&
    listed.filter((player) => isBigGuy(player.keywords)).length >= maxBigGuys
  ) {
    return `${team.rosterName} teams may have at most ${String(maxBigGuys)} Big Guy${maxBigGuys === 1 ? "" : "s"}.`;
  }
  if (
    !isLinemanPosition(template.keywords) &&
    listed.filter((player) => !isLinemanPosition(player.keywords)).length >=
      MAX_NON_LINEMEN
  ) {
    return `A Sevens team may have at most ${String(MAX_NON_LINEMEN)} players without the Lineman keyword.`;
  }
  const insignificant = countInsignificant(listed);
  if (
    hasSkill(template.skills, SkillType.INSIGNIFICANT) &&
    insignificant + 1 > listed.length - insignificant
  ) {
    return "A Team Draft List may not have more Insignificant players than players without Insignificant.";
  }
  return undefined;
}

export function hirePlayer(
  team: Team,
  template: PlayerTemplate
): PriceResult & { player?: Player } {
  const refusal = hireRefusal(team, template);
  if (refusal) return { amount: null, reason: refusal };
  const price = priceOf(team, { type: "player", cost: template.cost });
  if (price.amount == null) return price;
  if (team.treasury < price.amount) {
    return { amount: null, reason: "Not enough gold in the treasury." };
  }

  const number = freeRosterNumber(team);
  if (number === null) {
    return {
      amount: null,
      reason: "Every roster number from 1 to 11 is taken.",
    };
  }
  const player = createPlayer(template, team.id, number);
  player.id = uniquePlayerId(team, player.id);
  player.cost = price.amount;
  team.players.push(player);
  team.treasury -= price.amount;
  return { ...price, player };
}
