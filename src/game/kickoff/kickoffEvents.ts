import { type Player, PlayerStatus } from "../../types/Player";
export const KickoffEvent = {
  GET_THE_REF: "Get the Ref",
  TIME_OUT: "Time-Out",
  ALERT_DEFENCE: "Alert Defence",
  HIGH_KICK: "High Kick",
  CHEERING_FANS: "Cheering Fans",
  BRILLIANT_COACHING: "Brilliant Coaching",
  CHANGING_WEATHER: "Changing Weather",
  QUICK_SNAP: "Quick Snap",
  CHARGE: "Charge!",
  DODGY_SNACK: "Dodgy Snack",
  PITCH_INVASION: "Pitch Invasion",
} as const;
export type KickoffEvent = (typeof KickoffEvent)[keyof typeof KickoffEvent];

export const KICKOFF_TABLE_ROLL = "Kickoff Event";

export const KICKOFF_TABLE: Record<number, KickoffEvent> = {
  2: KickoffEvent.GET_THE_REF,
  3: KickoffEvent.TIME_OUT,
  4: KickoffEvent.ALERT_DEFENCE,
  5: KickoffEvent.HIGH_KICK,
  6: KickoffEvent.CHEERING_FANS,
  7: KickoffEvent.BRILLIANT_COACHING,
  8: KickoffEvent.CHANGING_WEATHER,
  9: KickoffEvent.QUICK_SNAP,
  10: KickoffEvent.CHARGE,
  11: KickoffEvent.DODGY_SNACK,
  12: KickoffEvent.PITCH_INVASION,
};

export const KICKOFF_EVENT_MEANING: Record<KickoffEvent, string> = {
  [KickoffEvent.GET_THE_REF]:
    "Each team gains one Bribe, usable until the end of the match.",
  [KickoffEvent.TIME_OUT]:
    "If the kicking team's marker is on turn 5 or 6, both markers move back one space; otherwise both move forward one.",
  [KickoffEvent.ALERT_DEFENCE]:
    "The kicking coach may move up to D3+1 of their Open players one square each in any direction, even into No Man's Land.",
  [KickoffEvent.HIGH_KICK]:
    "If the ball will land between the receiving End Zone and Line of Scrimmage, one Open receiving player may be placed in that square. Not in No Man's Land.",
  [KickoffEvent.CHEERING_FANS]:
    "D6 + Cheerleaders per coach; the winner (or both on a tie) gets an extra Offensive Assist on the first Block of their next turn.",
  [KickoffEvent.BRILLIANT_COACHING]:
    "D6 + Assistant Coaches per coach; the winner (or both on a tie) gains one free team re-roll for this drive.",
  [KickoffEvent.CHANGING_WEATHER]:
    "Re-roll the weather; on Perfect Conditions the ball Scatters (3) in the air before landing.",
  [KickoffEvent.QUICK_SNAP]:
    "The receiving coach may move up to D3+1 of their Open players one square each, with no dodge and no activation used.",
  [KickoffEvent.CHARGE]:
    "The kicking coach may give up to D3+1 Open players a free activation (Move; one Blitz, one Throw Team-mate and one Kick Team-mate across the sequence). Ends if anyone goes down.",
  [KickoffEvent.DODGY_SNACK]:
    "D6 per coach; the lowest (or both on a tie) has a random player on the pitch suffer -1 MA/-1 AV for the drive — or lose them to the Reserves on a 1.",
  [KickoffEvent.PITCH_INVASION]:
    "D6 + Fan Factor per coach; the lowest (or both on a tie) has a random player on the pitch Placed Prone and Stunned.",
};

export const INTERACTIVE_KICKOFF_EVENTS = new Set<KickoffEvent>([
  KickoffEvent.ALERT_DEFENCE,
  KickoffEvent.HIGH_KICK,
  KickoffEvent.QUICK_SNAP,
  KickoffEvent.CHARGE,
]);

export function steppingPlayerId(step: {
  selectedPlayerIds: string[];
  movedPlayerIds: string[];
}): string | null {
  const waiting = step.selectedPlayerIds.filter(
    (id) => !step.movedPlayerIds.includes(id)
  );
  return waiting[waiting.length - 1] ?? null;
}

export function isOneSquareMoveEvent(event: KickoffEvent): boolean {
  return (
    event === KickoffEvent.ALERT_DEFENCE || event === KickoffEvent.QUICK_SNAP
  );
}

export function kickoffEventOwner(
  event: KickoffEvent,
  kickingTeamId: string,
  receivingTeamId: string
): string {
  if (event === KickoffEvent.ALERT_DEFENCE || event === KickoffEvent.CHARGE) return kickingTeamId;
  if (event === KickoffEvent.HIGH_KICK || event === KickoffEvent.QUICK_SNAP) return receivingTeamId;
  throw new Error(`${event} is not an interactive kickoff event`);
}

export interface KickoffEventOutcome {
  event: KickoffEvent;

  meaning: string;

  perTeam: Record<string, string[]>;
}

export function grantEffect(
  outcome: KickoffEventOutcome,
  teamId: string,
  effect: string
): void {
  (outcome.perTeam[teamId] ??= []).push(effect);
}

export function kickoffEventForRoll(roll: number): KickoffEvent {
  const event = KICKOFF_TABLE[roll];
  if (event === undefined) throw new Error(`Invalid kickoff table roll: ${String(roll)}`);
  return event;
}

export function isOpenKickoffPlayer(player: Player, opponents: Player[]): boolean {
  const position = player.gridPosition;
  if (!position || player.status !== PlayerStatus.ACTIVE) return false;
  return !opponents.some((opponent) => opponent.status === PlayerStatus.ACTIVE && opponent.gridPosition
    && Math.max(Math.abs(opponent.gridPosition.x - position.x), Math.abs(opponent.gridPosition.y - position.y)) === 1);
}
