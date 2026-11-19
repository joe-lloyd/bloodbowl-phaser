import { type Team } from "../../types/Team";
import { KickoffEvent, type KickoffEventOutcome } from "./kickoffEvents";

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

const reveal: Record<KickoffEvent, string> = {
  [KickoffEvent.GET_THE_REF]: "Both teams gain a Bribe.",
  [KickoffEvent.TIME_OUT]: "Both turn markers move by one.",
  [KickoffEvent.ALERT_DEFENCE]:
    "Next, a D3: the kicking coach may move that many Open players, plus one, one square each.",
  [KickoffEvent.HIGH_KICK]:
    "The receiving coach may put one player under the ball if it lands in their half.",
  [KickoffEvent.CHEERING_FANS]:
    "Next, each team rolls a D6 and adds its Cheerleaders. The higher total gets an extra assist.",
  [KickoffEvent.BRILLIANT_COACHING]:
    "Next, each team rolls a D6 and adds its Assistant Coaches. The higher total gets a free re-roll.",
  [KickoffEvent.CHANGING_WEATHER]: "Next, 2D6 on the Weather Table again.",
  [KickoffEvent.QUICK_SNAP]:
    "Next, a D3: the receiving coach may move that many Open players, plus one, one square each.",
  [KickoffEvent.CHARGE]:
    "Next, a D3: the kicking coach may activate that many Open players, plus one, for free.",
  [KickoffEvent.DODGY_SNACK]:
    "Next, each team rolls a D6. The lower roll has a random player eat something bad.",
  [KickoffEvent.PITCH_INVASION]:
    "Next, each team rolls a D6 and adds its Dedicated Fans. The lower total has a random player Stunned.",
};

const ROLLS_FOR_ITS_RESULT = new Set<KickoffEvent>([
  KickoffEvent.CHEERING_FANS,
  KickoffEvent.BRILLIANT_COACHING,
  KickoffEvent.CHANGING_WEATHER,
  KickoffEvent.DODGY_SNACK,
  KickoffEvent.PITCH_INVASION,
]);

export function kickoffRevealLine(
  event: KickoffEvent,
  kicking: Team,
  receiving: Team
): string {
  if (ROLLS_FOR_ITS_RESULT.has(event)) return reveal[event];

  return `${reveal[event]} ${favoursLine({ event, meaning: "", perTeam: {} }, kicking, receiving)}`;
}

export function kickoffOutcomeLine(
  outcome: KickoffEventOutcome,
  kicking: Team,
  receiving: Team
): string | null {
  if (!ROLLS_FOR_ITS_RESULT.has(outcome.event)) return null;
  const lines = [kicking, receiving].flatMap((team) =>
    (outcome.perTeam[team.id] ?? []).map((effect) => `${team.name}: ${effect}`)
  );
  if (outcome.event === KickoffEvent.CHANGING_WEATHER) {
    return outcome.perTeam[kicking.id]?.[0] ?? null;
  }
  return lines.length > 0
    ? lines.join(" · ")
    : "Nobody on the pitch to take it.";
}

export function kickoffEventSummary(event: KickoffEvent): string {
  return summary[event];
}

export function kickoffMomentDetail(
  outcome: KickoffEventOutcome,
  kicking: Team,
  receiving: Team
): string {
  return `${summary[outcome.event]} ${favoursLine(outcome, kicking, receiving)}`;
}

function favoursLine(
  outcome: KickoffEventOutcome,
  kicking: Team,
  receiving: Team
): string {
  const teams = [kicking, receiving];
  const affected = teams.filter((team) => outcome.perTeam[team.id]?.length);

  const rollOff = (winners: Team[]): string => {
    const [first] = winners;
    return winners.length === 1 && first ? `Favours ${first.name}.` : "A tie, so it favours neither team.";
  };
  if (outcome.event === KickoffEvent.CHEERING_FANS || outcome.event === KickoffEvent.BRILLIANT_COACHING) return rollOff(affected);
  if (outcome.event === KickoffEvent.DODGY_SNACK || outcome.event === KickoffEvent.PITCH_INVASION) return rollOff(teams.filter((team) => !affected.includes(team)));
  return simpleFavours(outcome.event, kicking, receiving);
}

type SimpleEvent = Exclude<KickoffEvent,
  typeof KickoffEvent.CHEERING_FANS | typeof KickoffEvent.BRILLIANT_COACHING |
  typeof KickoffEvent.DODGY_SNACK | typeof KickoffEvent.PITCH_INVASION>;

function simpleFavours(event: SimpleEvent, kicking: Team, receiving: Team): string {
  let favours: string;
  switch (event) {
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
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
  return favours;
}
