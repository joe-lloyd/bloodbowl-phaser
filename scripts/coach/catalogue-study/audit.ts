import { writeFileSync } from "node:fs";
import { RULE_SCENARIOS } from "../../../src/data/ruleScenarios";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { enumerateDecision } from "../../../src/simulation/candidates";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../../src/competition/computerTeamTemplates";
import { TeamSpecialRule } from "../../../src/types/Team";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";

const rows = [];
for (const entry of RULE_SCENARIOS) {
  for (const config of entry.configs) {
    const game = new HeadlessGame({
      scenario: {
        id: config.id,
        name: config.name,
        description: config.description,
        setup: config.setup,
      },
      seed: 1,
    });
    const legalResult = await game.execute({ type: "legal-actions" });
    const legal = legalResult.legalActions;
    const point = await enumerateDecision(game, null);
    const players = legal?.players ?? [];
    for (const player of players) {
      for (const action of player.actions) {
        const offered = point.candidates.some((candidate) => {
          const command = candidate.commands[0];
          return (
            command.type === "declare-action" &&
            command.playerId === player.playerId &&
            command.action === action
          );
        });
        if (!offered)
          rows.push({
            config: config.id,
            skill: entry.skill,
            action,
            playerId: player.playerId,
          });
      }
    }
  }
}
const captains = getComputerTeamTemplates()
  .filter((template) =>
    getRosterByRosterName(template.rosterName).specialRules.includes(
      TeamSpecialRule.TEAM_CAPTAIN
    )
  )
  .map((template) => {
    const team = createComputerTeamFromTemplate(template.id);
    return {
      template: template.id,
      appointed: team.players.some((player) => player.teamCaptain),
    };
  });
const target = process.argv[2];
if (!target) throw new Error("Usage: audit.ts <output.json>");
writeFileSync(
  target,
  JSON.stringify({ omittedDeclarations: rows, captains }, null, 2)
);
const omittedActions = [...new Set(rows.map((row) => row.action))];
console.log(
  JSON.stringify({
    omittedActions,
    omissions: rows.length,
    captainTemplates: captains.length,
    appointed: captains.filter((team) => team.appointed).length,
  })
);
