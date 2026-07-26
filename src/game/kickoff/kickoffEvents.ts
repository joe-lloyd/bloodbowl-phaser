/**
 * The Blood Bowl Sevens kickoff table (2D6, 2-12). Replaces the standard
 * Blood Bowl table: Perfect Defence, Blitz! and Throw a Rock do not exist
 * in Sevens, and Brilliant Coaching sits on 7 where the standard table put
 * Changing Weather.
 */

export enum KickoffEvent {
  GET_THE_REF = "Get the Ref",
  TIME_OUT = "Time-Out",
  SOLID_DEFENCE = "Solid Defence",
  HIGH_KICK = "High Kick",
  CHEERING_FANS = "Cheering Fans",
  BRILLIANT_COACHING = "Brilliant Coaching",
  CHANGING_WEATHER = "Changing Weather",
  QUICK_SNAP = "Quick Snap",
  CHARGE = "Charge!",
  DODGY_SNACK = "Dodgy Snack",
  PITCH_INVASION = "Pitch Invasion",
}

export const KICKOFF_TABLE: Record<number, KickoffEvent> = {
  2: KickoffEvent.GET_THE_REF,
  3: KickoffEvent.TIME_OUT,
  4: KickoffEvent.SOLID_DEFENCE,
  5: KickoffEvent.HIGH_KICK,
  6: KickoffEvent.CHEERING_FANS,
  7: KickoffEvent.BRILLIANT_COACHING,
  8: KickoffEvent.CHANGING_WEATHER,
  9: KickoffEvent.QUICK_SNAP,
  10: KickoffEvent.CHARGE,
  11: KickoffEvent.DODGY_SNACK,
  12: KickoffEvent.PITCH_INVASION,
};

/** Plain rulebook statement of what an event does (for the match log). */
export const KICKOFF_EVENT_MEANING: Record<KickoffEvent, string> = {
  [KickoffEvent.GET_THE_REF]:
    "Each team gains one Bribe, usable until the end of the match.",
  [KickoffEvent.TIME_OUT]:
    "If the kicking team's marker is on turn 4-6, both markers move back one space; otherwise both move forward one.",
  [KickoffEvent.SOLID_DEFENCE]:
    "The kicking coach may drag up to D3+1 Open players directly to new legal setup squares.",
  [KickoffEvent.HIGH_KICK]:
    "One Open receiving player may be placed in the square the ball will land in.",
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

/** Events that open an interactive step for a coach before play resumes. */
export const INTERACTIVE_KICKOFF_EVENTS = new Set<KickoffEvent>([
  KickoffEvent.SOLID_DEFENCE,
  KickoffEvent.HIGH_KICK,
  KickoffEvent.QUICK_SNAP,
  KickoffEvent.CHARGE,
]);

/** Which coach an interactive event belongs to. */
export function kickoffEventOwner(
  event: KickoffEvent,
  kickingTeamId: string,
  receivingTeamId: string
): string {
  switch (event) {
    case KickoffEvent.SOLID_DEFENCE:
    case KickoffEvent.CHARGE:
      return kickingTeamId;
    case KickoffEvent.HIGH_KICK:
    case KickoffEvent.QUICK_SNAP:
      return receivingTeamId;
    default:
      throw new Error(`${event} is not an interactive kickoff event`);
  }
}

/**
 * A structured account of what a resolved kickoff event gave each team —
 * read by the match log, the HUD, and the online mirror alike.
 */
export interface KickoffEventOutcome {
  event: KickoffEvent;
  /** Plain rulebook statement of the event. */
  meaning: string;
  /** teamId -> legible effects the team received (may be empty). */
  perTeam: Record<string, string[]>;
}

/** Merges effect lines into an outcome under construction. */
export function grantEffect(
  outcome: KickoffEventOutcome,
  teamId: string,
  effect: string
): void {
  (outcome.perTeam[teamId] ??= []).push(effect);
}
