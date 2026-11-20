import { describe, expect, it } from "vitest";
import { fieldPlayer, game } from "./fixtures";
import { SkillType } from "../../src/types/Skills";
import { blockOdds } from "../../src/simulation/ai/chance";
import { key, readBoard } from "../../src/simulation/ai/board";
import { routesFor } from "../../src/simulation/ai/routes";
import { decide } from "../../src/simulation/ai/decisions";
import type { Candidate } from "../../src/simulation/candidates";

function wrestleBoard(attackerSkills: SkillType[]) {
  const subject = game({
    turn: 3,
    team1Placements: [{ playerIndex: 0, x: 8, y: 5, skills: attackerSkills }],
    team2Placements: [
      { playerIndex: 0, x: 9, y: 5, skills: [SkillType.WRESTLE] },
      { playerIndex: 1, x: 18, y: 1, hasBall: true },
    ],
  });
  const attacker = fieldPlayer(subject.ctx.team1.players[0]);
  const defender = fieldPlayer(subject.ctx.team2.players[0]);
  subject.ctx.gameService.getState().activePlayer = {
    id: attacker.id,
    action: "block",
  };
  return { subject, attacker, defender };
}

const answers: Candidate[] = [true, false].map((accept) => ({
  kind: "reaction",
  label: accept ? "accept" : "decline",
  commands: [{ type: "use-reaction", accept }],
}));

function wrestleAnswer(
  subject: ReturnType<typeof wrestleBoard>["subject"],
  self: { id: string; teamId: string }
) {
  const index = decide({
    board: readBoard(subject, self.teamId),
    pending: {
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.WRESTLE,
      prompt: "Use Wrestle to place both players prone (no armour rolls)?",
    },
    candidates: answers,
  });
  return index === null ? null : answers[index]?.label;
}

describe("Wrestle", () => {
  it("prices a Wrestle attacker's Both Down as the target down and no turnover", () => {
    const { attacker, defender } = wrestleBoard([SkillType.WRESTLE]);
    expect(
      blockOdds({
        attacker,
        defender,
        dice: 1,
        attackerPicks: true,
        teamReroll: false,
      })
    ).toEqual({ knockdown: 3 / 6, attackerDown: 1 / 6 });
  });

  it("wrestles as an attacker without Block", () => {
    const { subject, attacker } = wrestleBoard([SkillType.WRESTLE]);
    expect(wrestleAnswer(subject, attacker)).toBe("accept");
  });

  it("does not wrestle as a defender when the attacker would take the turnover", () => {
    const { subject, defender } = wrestleBoard([]);
    expect(wrestleAnswer(subject, defender)).toBe("decline");
  });

  it("wrestles as a defender when the attacker's Block would keep it standing", () => {
    const { subject, defender } = wrestleBoard([SkillType.BLOCK]);
    expect(wrestleAnswer(subject, defender)).toBe("accept");
  });
});

describe("Titchy", () => {
  it("adds one to a dodge", () => {
    const subject = game({
      turn: 3,
      team1Placements: [
        {
          playerIndex: 0,
          x: 8,
          y: 5,
          stats: { AG: 3 },
          skills: [SkillType.TITCHY],
        },
      ],
      team2Placements: [
        { playerIndex: 0, x: 9, y: 5 },
        { playerIndex: 1, x: 18, y: 1, hasBall: true },
      ],
    });
    const route = routesFor({
      board: readBoard(subject, subject.ctx.team1.id),
      player: fieldPlayer(subject.ctx.team1.players[0]),
    }).get(key({ x: 7, y: 5 }));
    expect(route?.chance).toBeCloseTo(5 / 6, 6);
  });
});
