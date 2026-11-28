import type { Weights } from "../../src/simulation/ai/weights";

export const GROUPS = {
  scoring: {
    title: "Scoring and moving the ball",
    summary: "How hard the carrier pushes for the end zone.",
  },
  carrier: {
    title: "Keeping the carrier safe",
    summary: "Cages, sidelines and where the carrier stops.",
  },
  ball: {
    title: "Getting the ball and getting open",
    summary: "Pick-ups, receivers, deep runners and team-mate throws.",
  },
  hitting: {
    title: "Hitting and hurting players",
    summary: "How much it wants to knock players down and injure them.",
  },
  fouling: {
    title: "Fouling",
    summary: "What a foul is worth and what being sent off costs.",
  },
  defence: {
    title: "Defending against their carrier",
    summary: "Marking, screening and chasing a loose ball.",
  },
  risk: {
    title: "Risk and caution",
    summary: "How much dice risk it takes and what a failure costs.",
  },
  kicking: {
    title: "Kicking off",
    summary: "Where it aims the kick.",
  },
} as const;

type GroupId = keyof typeof GROUPS;

interface WeightInfo {
  label: string;
  group: GroupId;
  description: string;
}

export const WEIGHT_INFO: Record<keyof Weights, WeightInfo> = {
  touchdown: {
    label: "Touchdown",
    group: "scoring",
    description:
      "Points a touchdown is worth. Every other value is measured against it, so it stays fixed.",
  },
  safeScore: {
    label: "Safe score chance",
    group: "scoring",
    description:
      "Lowest chance a scoring run, pass or hand-off needs to count as safe. Below it the play is ranked as a gamble, and a carrier below it calls for a deep receiver.",
  },
  advance: {
    label: "Forward progress",
    group: "scoring",
    description:
      "Worth of each square the carrier gains toward the end zone, scaled up for slow teams. Higher makes carriers run forward harder.",
  },
  carrierPace: {
    label: "Faster carrier",
    group: "scoring",
    description:
      "Worth of giving the ball to a faster team-mate, per square of extra speed and per turn left, up to three turns.",
  },
  sideways: {
    label: "Ball to open space",
    group: "scoring",
    description:
      "Worth of a pass or hand-off to a team-mate with fewer opponents around than the carrier, per opponent fewer.",
  },
  lateProgress: {
    label: "Late progress share",
    group: "scoring",
    description:
      "With one turn left in the half, the share of its usual worth a carrier move keeps when it still cannot score next turn.",
  },
  carrierMarked: {
    label: "Carrier marked",
    group: "carrier",
    description:
      "Cost for each opposing tackle zone on the square where the carrier stops. Higher keeps the carrier away from opponents.",
  },
  cageWalk: {
    label: "Count real threats",
    group: "carrier",
    description:
      "Above 0, the carrier's marking cost uses how likely opponents are to reach and hit it, instead of a plain count of tackle zones.",
  },
  carrierThreat: {
    label: "Carrier exposed",
    group: "carrier",
    description:
      "Cost for each opponent who could reach the carrier next turn, when fewer than three team-mates stand at the carrier's corners.",
  },
  sideline: {
    label: "Carrier on the sideline",
    group: "carrier",
    description:
      "Cost of the carrier stopping on the sideline, and a third of it one square in. Higher keeps the ball away from the crowd.",
  },
  wallSide: {
    label: "Carrier against a wall",
    group: "carrier",
    description:
      "On walled pitches, the cost of the carrier stopping against the wall.",
  },
  cageCorner: {
    label: "Cage corner",
    group: "carrier",
    description:
      "Worth of each team-mate on a corner next to the carrier, up to four, and of a player moving onto one.",
  },
  cageKeep: {
    label: "Close the cage",
    group: "carrier",
    description:
      "Extra worth of filling a cage corner after the carrier has moved this turn, so the cage closes where the carrier stopped.",
  },
  screen: {
    label: "Screen their carrier",
    group: "defence",
    description:
      "Worth of standing between their carrier and our end zone, half a point less for each square further back.",
  },
  pickupMin: {
    label: "Pick-up chance",
    group: "ball",
    description:
      "Lowest chance a pick-up or Secure the Ball needs to rank as a ball play rather than a gamble.",
  },
  pickup: {
    label: "Pick up the ball",
    group: "ball",
    description:
      "Worth of picking up a loose ball before its chance is applied, and of reaching the square where a kick will land.",
  },
  receiver: {
    label: "Receiver ahead",
    group: "ball",
    description:
      "Worth of a team-mate standing a few squares ahead of the carrier, ready for a hand-off or pass.",
  },
  deep: {
    label: "Deep receiver",
    group: "ball",
    description:
      "Worth of a receiver going deep to a square the carrier can throw to, times the chance the throw is accurate.",
  },
  deepCrowd: {
    label: "Crowded deep square",
    group: "ball",
    description: "Cost for each opponent near a deep receiver's square.",
  },
  launch: {
    label: "Team-mate throw ready",
    group: "ball",
    description:
      "Worth of a thrower standing next to a Right Stuff carrier who could be thrown toward the end zone.",
  },
  flank: {
    label: "Run the flank",
    group: "ball",
    description:
      "Worth of a runner going wide of a pressed carrier, per extra defender on the carrier's side. Off unless the flank game plan is picked.",
  },
  knockdown: {
    label: "Knock a player down",
    group: "hitting",
    description:
      "Base worth of knocking down an opponent who is not carrying the ball. The target's Strength is added to it.",
  },
  carrierKnockdown: {
    label: "Hit their carrier",
    group: "hitting",
    description:
      "Worth of knocking down their ball carrier, with a block, a blitz or a thrown team-mate landing on them.",
  },
  casualtyHit: {
    label: "Casualty",
    group: "hitting",
    description:
      "Worth of a casualty, times the chance a block or foul causes one. Brawlin' Brutes count it 2.25 times.",
  },
  cageBreak: {
    label: "Break their cage",
    group: "hitting",
    description: "Bonus for knocking down a player next to their carrier.",
  },
  freeCarrier: {
    label: "Free our carrier",
    group: "hitting",
    description: "Bonus for knocking down an opponent next to our own carrier.",
  },
  lane: {
    label: "Clear a running lane",
    group: "hitting",
    description:
      "Bonus for knocking down an opponent in the path ahead of our carrier. Off.",
  },
  attrition: {
    label: "Early casualties",
    group: "hitting",
    description:
      "Makes a casualty worth more the more of the match is left. Off.",
  },
  sureBlock: {
    label: "Safe block chance",
    group: "risk",
    description:
      "Chance of the attacker staying on their feet a block needs to count as safe rather than risky.",
  },
  sentOff: {
    label: "Sent off",
    group: "fouling",
    description:
      "Cost of the fouler being sent off, scaled by how much the fouler is worth against a lineman, squared.",
  },
  foulKnockOut: {
    label: "Foul knocks out",
    group: "fouling",
    description: "Worth of a foul knocking its target out.",
  },
  markCarrier: {
    label: "Mark their carrier",
    group: "defence",
    description:
      "Worth of standing next to their carrier, shared among our players already there.",
  },
  assist: {
    label: "Free assist",
    group: "defence",
    description:
      "Extra worth of a square next to their carrier that no other opponent marks, so the player there can assist a hit.",
  },
  chase: {
    label: "Chase a loose ball",
    group: "defence",
    description:
      "Worth of standing next to a loose ball or the square a kick will land on.",
  },
  safeMove: {
    label: "Safe move chance",
    group: "risk",
    description:
      "Lowest chance of making every dodge and rush that a support move needs. Lower lets players rush and dodge more to get into place.",
  },
  turnoverBase: {
    label: "Turnover",
    group: "risk",
    description:
      "Base cost of a turnover. The cost of failing any roll starts here.",
  },
  turnoverPerPlayer: {
    label: "Turnover per player left",
    group: "risk",
    description:
      "Extra turnover cost for each team-mate who has not acted yet, so a risk taken early in the turn costs more.",
  },
  ballLoss: {
    label: "Lose the ball",
    group: "risk",
    description: "Cost of dropping or losing the ball, on top of the turnover.",
  },
  ownDown: {
    label: "Our player down",
    group: "risk",
    description:
      "Cost of one of our players ending on the ground. Late in a half it is scaled up for players worth more than 50,000.",
  },
  seasonInjury: {
    label: "Lasting injuries",
    group: "risk",
    description:
      "In matches where injuries last beyond the match, how many times more it costs to risk a player.",
  },
  endInContact: {
    label: "End next to opponents",
    group: "risk",
    description:
      "Cost for each opposing tackle zone on the square where a support player stops.",
  },
  standUp: {
    label: "Stand up",
    group: "risk",
    description: "Worth of standing a player up who is lying down.",
  },
  kickDepth: {
    label: "Kick depth",
    group: "kicking",
    description: "How many squares from their goal line it aims the kick.",
  },
  kickWide: {
    label: "Kick wide",
    group: "kicking",
    description:
      "Above 0.5, it kicks away from the middle toward the side with fewer opponents. Otherwise it aims down the middle.",
  },
};
