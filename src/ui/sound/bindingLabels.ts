import { SoundName } from "./catalog";

/**
 * Human-readable description of the EventBus events that trigger each sound.
 * Display-only for the audition board — keep in sync with SoundSuite.mount().
 */
export const BINDING_LABELS: Record<SoundName, string[]> = {
  diceRoll: ["DiceRoll"],
  blockImpact: ["BlockDiceRolled"],
  pushback: ["PlayerPushedIntoCrowd"],
  knockdown: ["PlayerKnockedDown"],
  kickoff: ["BallKicked"],
  ballBounce: ["BallScattered"],
  catch: ["CatchSucceeded"],
  fumble: ["CatchFailed", "BallPickup (failed)", "PassFumbled"],
  pass: ["PassAttempted"],
  turnoverWhistle: ["Turnover"],
  touchdown: ["Touchdown"],
  koInjury: [
    "PlayerStatusChanged (KO/Injured)",
    "PlayerCasualtyInflicted (non-foul)",
  ],
  foul: ["PlayerCasualtyInflicted (special)"],
  sendOff: ["PlayerStatusChanged (Removed)"],
  endOfHalf: ["DriveEnded (halftime)", "PhaseChanged (Game Over)"],
  uiClick: ["UI_ActionSelected"],
};
