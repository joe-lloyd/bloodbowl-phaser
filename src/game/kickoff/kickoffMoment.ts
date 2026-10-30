import { Team } from "../../types/Team";
import { KickoffEvent, KickoffEventOutcome } from "./kickoffEvents";

/** The visible effect in one sentence. The full rule stays in the log. */
const summary: Record<KickoffEvent, string> = {
  [KickoffEvent.GET_THE_REF]: "Both teams gain a Bribe.",
  [KickoffEvent.TIME_OUT]: "Both turn markers move by one.",
  [KickoffEvent.ALERT_DEFENCE]:
    "The kicking coach may move D3+1 Open players one square.",
  [KickoffEvent.HIGH_KICK]:
    "The receiver may move one player under a legal landing square.",
  [KickoffEvent.CHEERING_FANS]:
    "The winners gain an extra assist on their next turn's first Block.",
  [KickoffEvent.BRILLIANT_COACHING]:
    "The winners gain a free team re-roll for this drive.",
  [KickoffEvent.CHANGING_WEATHER]: "The weather is rolled again.",
  [KickoffEvent.QUICK_SNAP]:
    "The receiver may move D3+1 Open players one square.",
  [KickoffEvent.CHARGE]:
    "The kicking coach may activate D3+1 Open players for free.",
  [KickoffEvent.DODGY_SNACK]:
    "The team that loses the roll has a player weakened or sent to Reserves.",
  [KickoffEvent.PITCH_INVASION]:
    "The team that loses the roll has a player Stunned by the crowd.",
};

export function kickoffMomentDetail(
  outcome: KickoffEventOutcome,
  kicking: Team,
  receiving: Team
): string {
  const teams = [kicking, receiving];
  const affected = teams.filter((team) => outcome.perTeam[team.id]?.length);
  /** The roll-off's winners, or a tie when it went the same for both. */
  const rollOff = (winners: Team[]): string =>
    winners.length === 1
      ? `Favours ${winners[0].name}.`
      : "A tie, so it favours neither team.";
  let favours: string;
  switch (outcome.event) {
    case KickoffEvent.GET_THE_REF:
      favours = "Favours both teams.";
      break;
    case KickoffEvent.TIME_OUT:
    case KickoffEvent.CHANGING_WEATHER:
      favours = "Favours neither team.";
      break;
    case KickoffEvent.ALERT_DEFENCE:
    case KickoffEvent.CHARGE:
      favours = `Favours ${kicking.name}.`;
      break;
    case KickoffEvent.HIGH_KICK:
      favours = `Favours ${receiving.name} if the landing square is eligible.`;
      break;
    case KickoffEvent.QUICK_SNAP:
      favours = `Favours ${receiving.name}.`;
      break;
    case KickoffEvent.CHEERING_FANS:
    case KickoffEvent.BRILLIANT_COACHING:
      favours = rollOff(affected);
      break;
    case KickoffEvent.DODGY_SNACK:
    case KickoffEvent.PITCH_INVASION:
      favours = rollOff(teams.filter((team) => !affected.includes(team)));
      break;
    default: {
      const unreachable: never = outcome.event;
      return unreachable;
    }
  }
  return `${summary[outcome.event]} ${favours}`;
}
