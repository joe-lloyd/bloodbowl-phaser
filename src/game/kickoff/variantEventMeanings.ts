import type { KickoffEvent } from "./kickoffEvents";

export type SevensKickoffEvent =
  | "Get the Ref"
  | "Time-Out"
  | "Alert Defence"
  | "High Kick"
  | "Cheering Fans"
  | "Brilliant Coaching"
  | "Changing Weather"
  | "Quick Snap"
  | "Charge!"
  | "Dodgy Snack"
  | "Pitch Invasion";

export const FAN_FACTOR_REROLL_MEANING =
  "D6 + Fan Factor per coach; the higher total gains a team re-roll for this drive. A tie gives nothing.";

export const VARIANT_EVENT_MEANING: Record<
  Exclude<KickoffEvent, SevensKickoffEvent>,
  string
> = {
  "Loose Masonry":
    "A random Wide Zone is hit by falling bricks: every player in it is Knocked Down and makes an unmodified Armour roll.",
  Riot: "D6 per coach; the lower (or both on a tie) has D3 random players on the pitch Placed Prone and Stunned.",
  "Stray Pony":
    "Every player on a Line of Scrimmage Dodges into the square behind them, pushing anyone there straight back. A failed Dodge is Knocked Down with +2 Armour. ST 5 or more skips the roll.",
  "Potion Peddler": "Each team gains one Magic Potion.",
  "Blitz!":
    "The kicking coach may give up to D3+1 Open players a free Move; one may Blitz and one may Throw Team-mate. Ends if anyone goes down.",
  "Throw a Bomb":
    "D6 + Fan Factor per coach; the lower team has a random player on the pitch hit by an accurate bomb. A tie is a dud.",
  "Guards!":
    "The lowest MA player on each team takes a ST 3 block with no skills, pushed towards their own End Zone. A player Knocked Down is arrested for the rest of the game.",
  "High Tide":
    "A random Wide Zone floods for the drive. Players in it wade into Centre Field, and a kick landing in it is a touchback.",
  Rousted:
    "On turn 5 for the receivers both markers go back one; with no receiving turn yet this half both go forward one; otherwise a D6: 1-3 forward, 4-6 back.",
  "Lost Ball":
    "D6: 1-3 a conch shell (-1 pick-up, catch and intercept); 4-6 a beach ball (-1 pass, +1 pick-up, catch and intercept). Lasts the game or until rolled again.",
  "Samba!":
    "D6 + Cheerleaders per coach; the higher total gains a team re-roll for this drive. A tie gives nothing.",
  "Jellyfish!?":
    "D6 per coach; the lower (or both on a tie) has a random player on the pitch make an Injury roll.",
  "Seagull Attack":
    "For this drive Quick and Short passes are at -1, Long passes and Long Bombs at -2.",
  "Monster Wave":
    "Every player on the pitch is washed D3 squares in one random direction. Anyone washed off the pitch goes to the Reserves.",
  "Falling Roof Tiles":
    "Every player in a random Wide Zone makes an Armour roll; a break means an Injury roll.",
  "Riot!":
    "Roll a D6 for every player on the pitch; on a 6 they are Placed Prone and Stunned.",
  "Quick Attack":
    "One kicking player may Block before the first turn.",
  "Rogue Washing Line":
    "Each team has a random player on the pitch who cannot act in its next turn.",
  "This Round Is on Us!":
    "For this drive a player who is KO'd rolls a D6 and goes to the Reserves on 4+.",
  "Loose Dogs": "For this drive no team re-rolls on pick-ups or Blocks.",
  "Black Market Dealer": "Each team gains a free Lesser Magic Potion.",
  "Furious Neighbour":
    "D6 + Fan Factor per coach; the lower (or both on a tie) has a random player on the pitch KO'd.",
  "The Guards Are Coming!":
    "Each team picks a random player on the pitch and rolls a D6; on 1-2 they are arrested for the game.",
  "Tentacled Terror":
    "D6 per coach; the lower (or both on a tie) has a random player on the pitch become a Casualty.",
  "Sudden Stink":
    "Every player on a Line of Scrimmage is pushed one square towards their own End Zone, pushing anyone behind them in turn.",
  "Bats!":
    "D6 per coach; the lower (or both on a tie) has a random player on the pitch Placed Prone and Stunned.",
  "Get Ready, Lads!":
    "Each Open receiving player may move one square.",
  "Sticky Sludge":
    "For this drive pick-ups are at +1, but a ball carrier cannot Pass.",
  "'Fresh' Sewage":
    "Every player within 2 squares of a sewer pit is Placed Prone.",
  "Swarm of Rats":
    "For this drive a player who ends an activation next to a wall rolls a D6 and Falls Over on a 1.",
};
