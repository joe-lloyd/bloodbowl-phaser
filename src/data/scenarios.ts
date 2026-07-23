import { Scenario } from "../types/Scenario";
import { GamePhase, SubPhase } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import { RosterName } from "../types/Team";
import { SkillType } from "../types/Skills";

export const SCENARIOS: Scenario[] = [
  {
    id: "chain-push",
    name: "Chain Push Test",
    description: "Defender's push squares are all occupied - block to chain",
    setup: {
      team1Placements: [{ playerIndex: 0, x: 9, y: 5 }],
      team2Placements: [
        { playerIndex: 0, x: 10, y: 5 }, // block target
        { playerIndex: 1, x: 11, y: 4 }, // all three push squares occupied
        { playerIndex: 2, x: 11, y: 5 },
        { playerIndex: 3, x: 11, y: 6 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  },
  {
    id: "crowd-surf",
    name: "Crowd Surf Test",
    description: "Sideline defender with blocked push squares - block to surf",
    setup: {
      team1Placements: [{ playerIndex: 0, x: 9, y: 0 }],
      team2Placements: [
        { playerIndex: 0, x: 10, y: 0 }, // block target on the sideline
        { playerIndex: 1, x: 11, y: 0 }, // both on-pitch push squares occupied
        { playerIndex: 2, x: 11, y: 1 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 0 }, // target carries the ball: throw-in test
    },
  },
  {
    id: "debug-empty",
    name: "Empty Pitch",
    description: "Clear pitch with no players placed",
    setup: {
      team1Placements: [],
      team2Placements: [],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  },
  {
    id: "basic-scrimmage",
    name: "Basic Scrimmage",
    description: "Standard 3-man line of scrimmage setup",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 9, y: 5, status: PlayerStatus.ACTIVE },
        { playerIndex: 1, x: 9, y: 4, status: PlayerStatus.ACTIVE },
        { playerIndex: 2, x: 9, y: 6, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 10, y: 5, status: PlayerStatus.ACTIVE },
        { playerIndex: 1, x: 10, y: 4, status: PlayerStatus.ACTIVE },
        { playerIndex: 2, x: 10, y: 6, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 5, y: 5 },
    },
  },
  {
    id: "movement-test",
    name: "Movement Test",
    description: "Test player movement ranges and obstacles",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 2, y: 5, status: PlayerStatus.ACTIVE }, // Runner
      ],
      team2Placements: [
        { playerIndex: 0, x: 6, y: 4, status: PlayerStatus.ACTIVE }, // Obstacle
        { playerIndex: 1, x: 6, y: 5, status: PlayerStatus.ACTIVE }, // Obstacle
        { playerIndex: 2, x: 6, y: 6, status: PlayerStatus.ACTIVE }, // Obstacle
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  },
  {
    id: "jump-over-prone",
    name: "Jump Over a Prone Player",
    description:
      "Declare Move, then Jump the ball carrier at (8,5) over the Prone " +
      "defender at (9,5) into the empty square (10,5) beyond. The base Jump " +
      "only clears Prone/Stunned players — the Standing defender at (12,5) " +
      "cannot be jumped without Leap or Pogo.",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 8, y: 5, status: PlayerStatus.ACTIVE }, // jumper (carries ball)
      ],
      team2Placements: [
        { playerIndex: 0, x: 9, y: 5, status: PlayerStatus.PRONE }, // jump over this one
        { playerIndex: 1, x: 12, y: 5, status: PlayerStatus.ACTIVE }, // Standing — base Jump can't clear it
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 8, y: 5 }, // on the jumper
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  },
  {
    id: "kickoff-test",
    name: "Kickoff Test",
    description: "Test kickoff camera tracking - ball ready to kick",
    setup: {
      team1Placements: [
        // Kicking team - spread out in their half
        { playerIndex: 0, x: 3, y: 7, status: PlayerStatus.ACTIVE },
        { playerIndex: 1, x: 5, y: 5, status: PlayerStatus.ACTIVE },
        { playerIndex: 2, x: 5, y: 9, status: PlayerStatus.ACTIVE },
        { playerIndex: 3, x: 7, y: 4, status: PlayerStatus.ACTIVE },
        { playerIndex: 4, x: 7, y: 10, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        // Receiving team - waiting in their half
        { playerIndex: 0, x: 15, y: 7, status: PlayerStatus.ACTIVE },
        { playerIndex: 1, x: 17, y: 5, status: PlayerStatus.ACTIVE },
        { playerIndex: 2, x: 17, y: 9, status: PlayerStatus.ACTIVE },
        { playerIndex: 3, x: 19, y: 6, status: PlayerStatus.ACTIVE },
        { playerIndex: 4, x: 19, y: 8, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team1",
      phase: GamePhase.KICKOFF,
      subPhase: SubPhase.ROLL_KICKOFF,
    },
  },
  {
    id: "throw-quick-pass",
    name: "Quick Pass Test",
    description: "Test quick pass (0-3 squares) with open receiver",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 7, status: PlayerStatus.ACTIVE }, // Thrower with ball
        { playerIndex: 1, x: 12, y: 7, status: PlayerStatus.ACTIVE }, // Open receiver (2 squares away)
        { playerIndex: 2, x: 8, y: 5, status: PlayerStatus.ACTIVE }, // Support player
      ],
      team2Placements: [
        { playerIndex: 0, x: 15, y: 7, status: PlayerStatus.ACTIVE }, // Distant opponent
        { playerIndex: 1, x: 16, y: 5, status: PlayerStatus.ACTIVE }, // Distant opponent
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 7 }, // Ball at thrower's position
    },
  },
  {
    id: "throw-short-pass",
    name: "Short Pass Test",
    description: "Test short pass (4-6 squares) with open receiver",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 8, y: 7, status: PlayerStatus.ACTIVE }, // Thrower with ball
        { playerIndex: 1, x: 14, y: 7, status: PlayerStatus.ACTIVE }, // Open receiver (6 squares away)
        { playerIndex: 2, x: 6, y: 5, status: PlayerStatus.ACTIVE }, // Support player
      ],
      team2Placements: [
        { playerIndex: 0, x: 18, y: 7, status: PlayerStatus.ACTIVE }, // Distant opponent
        { playerIndex: 1, x: 19, y: 5, status: PlayerStatus.ACTIVE }, // Distant opponent
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 8, y: 7 }, // Ball at thrower's position
    },
  },
  {
    id: "throw-long-pass",
    name: "Long Pass Test",
    description: "Test long pass (7-10 squares) with open receiver",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 7, status: PlayerStatus.ACTIVE }, // Thrower with ball
        { playerIndex: 1, x: 15, y: 7, status: PlayerStatus.ACTIVE }, // Open receiver (10 squares away)
        { playerIndex: 2, x: 3, y: 5, status: PlayerStatus.ACTIVE }, // Support player
      ],
      team2Placements: [
        { playerIndex: 0, x: 20, y: 7, status: PlayerStatus.ACTIVE }, // Distant opponent
        { playerIndex: 1, x: 21, y: 5, status: PlayerStatus.ACTIVE }, // Distant opponent
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 5, y: 7 }, // Ball at thrower's position
    },
  },
  {
    id: "throw-marked-receiver",
    name: "Marked Receiver Test",
    description: "Test catching with marked receiver (-1 per marker)",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 8, y: 7, status: PlayerStatus.ACTIVE }, // Thrower with ball
        { playerIndex: 1, x: 12, y: 7, status: PlayerStatus.ACTIVE }, // Marked receiver
        { playerIndex: 2, x: 6, y: 5, status: PlayerStatus.ACTIVE }, // Support player
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 7, status: PlayerStatus.ACTIVE }, // Marker 1 (adjacent to receiver)
        { playerIndex: 1, x: 13, y: 7, status: PlayerStatus.ACTIVE }, // Marker 2 (adjacent to receiver)
        { playerIndex: 2, x: 12, y: 6, status: PlayerStatus.ACTIVE }, // Marker 3 (adjacent to receiver)
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 8, y: 7 }, // Ball at thrower's position
    },
  },
  {
    id: "throw-interception-test",
    name: "Interception Test",
    description: "Test interception with opponent in pass path",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 6, y: 7, status: PlayerStatus.ACTIVE }, // Thrower with ball
        { playerIndex: 1, x: 16, y: 7, status: PlayerStatus.ACTIVE }, // Receiver
        { playerIndex: 2, x: 4, y: 5, status: PlayerStatus.ACTIVE }, // Support player
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 7, status: PlayerStatus.ACTIVE }, // Interceptor in pass path
        { playerIndex: 1, x: 18, y: 5, status: PlayerStatus.ACTIVE }, // Distant opponent
        { playerIndex: 2, x: 19, y: 9, status: PlayerStatus.ACTIVE }, // Distant opponent
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 6, y: 7 }, // Ball at thrower's position
    },
  },
  {
    id: "throw-pickup-and-pass",
    name: "Pickup and Pass Test",
    description: "Test picking up ball then passing to teammate",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 8, y: 7, status: PlayerStatus.ACTIVE }, // Player who will pickup
        { playerIndex: 1, x: 12, y: 7, status: PlayerStatus.ACTIVE }, // Open receiver
        { playerIndex: 2, x: 6, y: 5, status: PlayerStatus.ACTIVE }, // Support player
      ],
      team2Placements: [
        { playerIndex: 0, x: 15, y: 7, status: PlayerStatus.ACTIVE }, // Distant opponent
        { playerIndex: 1, x: 16, y: 5, status: PlayerStatus.ACTIVE }, // Distant opponent
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 7 }, // Ball on ground (2 squares from player)
    },
  },
  {
    id: "throw-marked-thrower",
    name: "Marked Thrower Test",
    description:
      "Test passing with thrower being marked (-1 per marker to pass)",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 7, status: PlayerStatus.ACTIVE }, // Thrower with ball (marked)
        { playerIndex: 1, x: 14, y: 7, status: PlayerStatus.ACTIVE }, // Open receiver
        { playerIndex: 2, x: 8, y: 5, status: PlayerStatus.ACTIVE }, // Support player
      ],
      team2Placements: [
        { playerIndex: 0, x: 9, y: 7, status: PlayerStatus.ACTIVE }, // Marker 1 (adjacent to thrower)
        { playerIndex: 1, x: 11, y: 7, status: PlayerStatus.ACTIVE }, // Marker 2 (adjacent to thrower)
        { playerIndex: 2, x: 10, y: 6, status: PlayerStatus.ACTIVE }, // Marker 3 (adjacent to thrower)
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 7 }, // Ball at thrower's position
    },
  },
  {
    id: "throw-team-mate-ogre",
    name: "Throw Team-mate (Ogre & Gnoblar)",
    description:
      "An Ogre Blocker (Throw Team-mate), marked by two opponents, throws a ball-carrying Gnoblar (Right Stuff) downfield. Watch the marking penalty and the ball fly with the Gnoblar.",
    setup: {
      team1Roster: RosterName.OGRE,
      team1Placements: [
        // Index 0 = Ogre Blocker (Throw Team-mate) — the thrower, marked.
        { playerIndex: 0, x: 8, y: 5, status: PlayerStatus.ACTIVE },
        // Index 3 = Gnoblar Lineman (Right Stuff, ST 1) — carries the ball.
        { playerIndex: 3, x: 9, y: 5, status: PlayerStatus.ACTIVE },
        // A second Ogre Blocker as support.
        { playerIndex: 1, x: 7, y: 8, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 7, y: 5, status: PlayerStatus.ACTIVE }, // Marker on the thrower
        { playerIndex: 1, x: 8, y: 4, status: PlayerStatus.ACTIVE }, // Marker on the thrower
        { playerIndex: 2, x: 14, y: 6, status: PlayerStatus.ACTIVE }, // Downfield defender
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 9, y: 5 }, // On the Gnoblar being thrown
    },
  },
  {
    id: "kick-team-mate-ogre",
    name: "Kick Team-mate (Ogre & Gnoblar)",
    description:
      "An Ogre Runt Punter (Kick Team-mate) launches a Gnoblar (Right Stuff) downfield — a fumble removes and injures the Gnoblar.",
    setup: {
      team1Roster: RosterName.OGRE,
      team1Placements: [
        // Index 2 = Ogre Runt Punter (Kick Team-mate) — the kicker.
        { playerIndex: 2, x: 8, y: 5, status: PlayerStatus.ACTIVE },
        // Index 3 = Gnoblar Lineman (Right Stuff) — kicked.
        { playerIndex: 3, x: 9, y: 5, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 14, y: 5, status: PlayerStatus.ACTIVE }, // Downfield defender
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  },
  {
    id: "throw-bomb-bombardier",
    name: "Throw Bomb (Bombardier)",
    description:
      "A Bombardier lobs a bomb at a cluster of opponents. Declare Throw Bomb, click a target square, and watch it explode — the square it lands in is hit and each adjacent player is hit on a 4+ (Armour Rolls all round). A Fumble blows up in the Bomber's own square.",
    setup: {
      team1Placements: [
        // The Bomber — Standing, ready to throw. Bombardier granted for the demo.
        {
          playerIndex: 0,
          x: 8,
          y: 5,
          status: PlayerStatus.ACTIVE,
          skills: [SkillType.BOMBARDIER],
        },
      ],
      team2Placements: [
        // A tight cluster downfield so the blast can catch several at once.
        { playerIndex: 0, x: 13, y: 5, status: PlayerStatus.ACTIVE },
        { playerIndex: 1, x: 13, y: 4, status: PlayerStatus.ACTIVE },
        { playerIndex: 2, x: 14, y: 5, status: PlayerStatus.ACTIVE },
        { playerIndex: 3, x: 13, y: 6, status: PlayerStatus.PRONE },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  },
  {
    id: "gnoblar-touchdown-run",
    name: "Gnoblar Touchdown Run",
    description:
      "A Gnoblar (Right Stuff, MA 5) has the ball four squares from the end zone. Move it into the right end zone (x = 19) to score a touchdown — dodge past the defenders with Dodge/Sidestep.",
    setup: {
      team1Roster: RosterName.OGRE,
      team1Placements: [
        // Index 3 = Gnoblar Lineman — the ball carrier.
        { playerIndex: 3, x: 15, y: 5, status: PlayerStatus.ACTIVE },
        // A trailing Ogre Blocker.
        { playerIndex: 0, x: 12, y: 5, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 17, y: 4, status: PlayerStatus.ACTIVE }, // Defender to dodge past
        { playerIndex: 1, x: 17, y: 6, status: PlayerStatus.ACTIVE }, // Defender to dodge past
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 15, y: 5 }, // On the Gnoblar
    },
  },
  {
    id: "setup-intro",
    name: "Setup: Intro",
    description: "Start at the game introduction screen",
    setup: {
      team1Placements: [],
      team2Placements: [],
      activeTeam: "team1",
      phase: GamePhase.SETUP,
      subPhase: SubPhase.INTRO,
    },
  },
  {
    id: "setup-coinflip",
    name: "Setup: Coin Flip",
    description: "Start at the coin flip sequence",
    setup: {
      team1Placements: [],
      team2Placements: [],
      activeTeam: "team1",
      phase: GamePhase.SETUP,
      subPhase: SubPhase.COIN_FLIP,
    },
  },
  {
    id: "block-injury-test",
    name: "Block & Injury Test",
    description:
      "Big Guy (Black Orc) vs Small Guy (Goblin) for testing injury logic",
    setup: {
      team1Placements: [
        { playerIndex: 3, x: 10, y: 7, status: PlayerStatus.ACTIVE }, // Goblin Bruiser (Defender)
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 7, status: PlayerStatus.ACTIVE }, // Black Orc (Attacker)
      ],
      activeTeam: "team2",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      team1Roster: RosterName.IMPERIAL_NOBILITY,
      team2Roster: RosterName.BLACK_ORC,
    },
  },
  {
    id: "foul-test",
    name: "Foul Test",
    description: "Test 'move then foul' flow with assists",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, status: PlayerStatus.ACTIVE }, // Fouler
        { playerIndex: 1, x: 11, y: 5, status: PlayerStatus.ACTIVE }, // Offensive Assister
      ],
      team2Placements: [
        { playerIndex: 0, x: 10, y: 5, status: PlayerStatus.PRONE }, // Target (Prone)
        { playerIndex: 1, x: 10, y: 4, status: PlayerStatus.ACTIVE }, // Defensive Assister (marks Fouler at 9,5)
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      team1Roster: RosterName.IMPERIAL_NOBILITY,
      team2Roster: RosterName.OGRE,
    },
  },
  // =========================================================================
  // SEEDED SCENARIOS - Deterministic outcomes for testing
  // =========================================================================
  {
    id: "block-injury-stun",
    name: "Block → Stun (Seeded)",
    description: "POW → Armor Break → Stunned (deterministic)",
    seed: 10,
    expectedOutcome: "Defender will be stunned",
    setup: {
      team1Placements: [
        { playerIndex: 3, x: 10, y: 7, status: PlayerStatus.ACTIVE }, // Goblin Bruiser (Defender)
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 7, status: PlayerStatus.ACTIVE }, // Black Orc (Attacker)
      ],
      activeTeam: "team2",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      team1Roster: RosterName.IMPERIAL_NOBILITY,
      team2Roster: RosterName.BLACK_ORC,
    },
  },
  {
    id: "block-injury-ko",
    name: "Block → KO (Seeded)",
    description: "POW → Armor Break → Knocked Out (deterministic)",
    seed: 69,
    expectedOutcome: "Defender will be knocked out",
    setup: {
      team1Placements: [
        { playerIndex: 3, x: 10, y: 7, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 7, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team2",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      team1Roster: RosterName.IMPERIAL_NOBILITY,
      team2Roster: RosterName.BLACK_ORC,
    },
  },
  {
    id: "block-injury-casualty",
    name: "Block → Casualty (Seeded)",
    description: "POW → Armor Break → Casualty (deterministic)",
    seed: 102,
    expectedOutcome: "Defender will suffer a casualty",
    setup: {
      team1Placements: [
        { playerIndex: 3, x: 10, y: 7, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 7, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team2",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      team1Roster: RosterName.IMPERIAL_NOBILITY,
      team2Roster: RosterName.BLACK_ORC,
    },
  },
  {
    id: "block-injury-death",
    name: "Block → Death (Seeded)",
    description: "POW → Armor Break → DEAD! (deterministic)",
    seed: 323,
    expectedOutcome: "Defender will DIE (casualty 15-16)",
    setup: {
      team1Placements: [
        { playerIndex: 3, x: 10, y: 7, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 7, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team2",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      team1Roster: RosterName.IMPERIAL_NOBILITY,
      team2Roster: RosterName.BLACK_ORC,
    },
  },
  {
    id: "pass-success-seeded",
    name: "Pass → Success (Seeded)",
    description: "Perfect pass and catch (deterministic)",
    seed: 776,
    expectedOutcome: "Pass and catch will both succeed",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 7, status: PlayerStatus.ACTIVE }, // Thrower with ball
        { playerIndex: 1, x: 12, y: 7, status: PlayerStatus.ACTIVE }, // Open receiver
      ],
      team2Placements: [
        { playerIndex: 0, x: 15, y: 7, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 7 },
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  },
  {
    id: "pass-fumble-seeded",
    name: "Pass → Fumble (Seeded)",
    description: "Failed pass attempt (deterministic)",
    seed: 7,
    expectedOutcome: "Thrower will fumble the pass",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 7, status: PlayerStatus.ACTIVE },
        { playerIndex: 1, x: 12, y: 7, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 15, y: 7, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 7 },
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  },
  {
    id: "pickup-success-seeded",
    name: "Pickup → Success (Seeded)",
    description: "Successful ball pickup (deterministic)",
    seed: 6,
    expectedOutcome: "Player will pick up the ball",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 9, y: 7, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 15, y: 7, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 7 },
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  },
  {
    id: "pickup-fumble-seeded",
    name: "Pickup → Fumble (Seeded)",
    description: "Failed pickup attempt (deterministic)",
    seed: 7,
    expectedOutcome: "Player will fumble the pickup",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 9, y: 7, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 15, y: 7, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 7 },
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  },
  {
    id: "double-turnover-seeded",
    name: "Double Turnover Chain (Seeded)",
    description:
      "Move onto the ball: the pickup fails, the bounce hits a teammate who " +
      "drops it. Only ONE turnover may happen (the latch absorbs the second).",
    seed: 8,
    expectedOutcome:
      "Failed pickup → bounce → teammate drops it → exactly one turnover",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 8, y: 7, status: PlayerStatus.ACTIVE }, // mover
        // Teammates ring the ball square so the bounce lands on one of them
        { playerIndex: 1, x: 9, y: 6, status: PlayerStatus.ACTIVE },
        { playerIndex: 2, x: 10, y: 6, status: PlayerStatus.ACTIVE },
        { playerIndex: 3, x: 11, y: 6, status: PlayerStatus.ACTIVE },
        { playerIndex: 4, x: 11, y: 7, status: PlayerStatus.ACTIVE },
        { playerIndex: 5, x: 9, y: 8, status: PlayerStatus.ACTIVE },
        { playerIndex: 6, x: 10, y: 8, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 15, y: 2, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 7 },
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  },
  {
    id: "blitz-test",
    name: "Blitz Test",
    description:
      "Regular blitz: declare Blitz, move up to the defender and block. " +
      "Rush prompts appear only past MA.",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 7, status: PlayerStatus.ACTIVE }, // blitzer
      ],
      team2Placements: [
        { playerIndex: 0, x: 14, y: 7, status: PlayerStatus.ACTIVE }, // target
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  },
  {
    id: "blitz-rush-fail-seeded",
    name: "Blitz → Failed Rush (Seeded)",
    description:
      "Blitz with the defender exactly MA+1 away: move all 6 squares, then " +
      "block. The block costs the 7th movement point → Rush roll fails.",
    seed: 7,
    expectedOutcome:
      "Rush (GFI) before the block fails: blitzer falls, turnover, no block dice",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 7, status: PlayerStatus.ACTIVE }, // blitzer, MA 6
      ],
      team2Placements: [
        { playerIndex: 0, x: 17, y: 7, status: PlayerStatus.ACTIVE }, // target
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  },
  {
    id: "blocked-carrier-seeded",
    name: "Block the Carrier → No Turnover (Seeded)",
    description:
      "Team 2 blocks team 1's ball carrier with a POW: the carrier drops " +
      "the ball, but that is NOT a turnover — team 2 keeps playing.",
    seed: 2,
    expectedOutcome:
      "POW → carrier down, ball bounces loose, blocker's team keeps the turn",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, status: PlayerStatus.ACTIVE }, // carrier
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.ACTIVE }, // blocker
        { playerIndex: 1, x: 16, y: 8, status: PlayerStatus.ACTIVE }, // keeps the turn alive
      ],
      activeTeam: "team2",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 5 },
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  },
  {
    id: "touchback-test",
    name: "Kickoff → Touchback (Seeded)",
    description:
      "Kick aimed at the receiving corner deviates out of bounds: the " +
      "receiving coach hands the ball to any of their players.",
    seed: 4,
    expectedOutcome:
      "Ball goes out → Touchback → receiving coach picks the ball carrier",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 6, y: 2, status: PlayerStatus.ACTIVE },
        { playerIndex: 1, x: 5, y: 3, status: PlayerStatus.ACTIVE },
        { playerIndex: 2, x: 4, y: 4, status: PlayerStatus.ACTIVE },
        { playerIndex: 3, x: 6, y: 5, status: PlayerStatus.ACTIVE },
        { playerIndex: 4, x: 5, y: 6, status: PlayerStatus.ACTIVE },
        { playerIndex: 5, x: 4, y: 7, status: PlayerStatus.ACTIVE },
        { playerIndex: 6, x: 6, y: 8, status: PlayerStatus.ACTIVE },
      ],
      team2Placements: [
        { playerIndex: 0, x: 13, y: 2, status: PlayerStatus.ACTIVE },
        { playerIndex: 1, x: 14, y: 3, status: PlayerStatus.ACTIVE },
        { playerIndex: 2, x: 15, y: 4, status: PlayerStatus.ACTIVE },
        { playerIndex: 3, x: 13, y: 5, status: PlayerStatus.ACTIVE },
        { playerIndex: 4, x: 14, y: 6, status: PlayerStatus.ACTIVE },
        { playerIndex: 5, x: 15, y: 7, status: PlayerStatus.ACTIVE },
        { playerIndex: 6, x: 13, y: 8, status: PlayerStatus.ACTIVE },
      ],
      activeTeam: "team1",
      phase: GamePhase.KICKOFF,
      subPhase: SubPhase.ROLL_KICKOFF,
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  },
];
