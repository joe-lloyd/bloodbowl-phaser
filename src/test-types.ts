/**
 * Test file to verify type definitions work correctly
 */

import {
  createPlayer,
  createTeam,
  createGame,
  PlayerPosition,
  TeamRace,
  SkillType,
  getSkill,
  addPlayerToTeam,
  calculateTeamValue,
  type PlayerTemplate,
} from "./types";

// Test creating a player template
const linemanTemplate: PlayerTemplate = {
  position: PlayerPosition.LINEMAN,
  cost: 50000,
  stats: {
    MA: 6,
    ST: 3,
    AG: 3,
    PA: 4, // 2020 rules: Passing Ability
    AV: 8,
  },
  skills: [getSkill(SkillType.BLOCK)],
};

// Test creating a team
const team1 = createTeam(
  "The Mighty Ducks",
  TeamRace.HUMAN,
  { primary: 0xff4444, secondary: 0xffffff },
  50000
);

// Test creating and adding players
const player1 = createPlayer(linemanTemplate, team1.id, 1, "Bob the Blocker");
const player2 = createPlayer(linemanTemplate, team1.id, 2, "Jim the Jammer");

addPlayerToTeam(team1, player1);
addPlayerToTeam(team1, player2);

// Test team value calculation
const teamValue = calculateTeamValue(team1);
console.log("Team value:", teamValue);

// Test creating a game
const team2 = createTeam(
  "The Orc Smashers",
  TeamRace.ORC,
  { primary: 0x44ff44, secondary: 0x000000 },
  60000
);

const game = createGame(team1, team2);

console.log("Game created:", game.id);
console.log("Current turn:", game.turn.turn);
console.log("Current half:", game.turn.half);
console.log(
  "Active team:",
  game.turn.activeTeamId === team1.id ? team1.name : team2.name
);

console.log("✅ All type tests passed!");
