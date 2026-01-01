import { Scenario } from "../types/Scenario";
import { GamePhase, SubPhase } from "../types/GameState";
import { PlayerStatus } from "../types/Player";

export const SCENARIOS: Scenario[] = [
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
      subPhase: SubPhase.SETUP_KICKOFF,
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
];
