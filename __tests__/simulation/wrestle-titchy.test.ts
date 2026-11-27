import { describe, expect, it } from "vitest";
import { fieldPlayer, game } from "./fixtures";
import { SkillType } from "../../src/types/Skills";
import { PlayerCondition } from "../../src/types/Player";
import { blockOdds } from "../../src/simulation/ai/chance";
import { key, readBoard } from "../../src/simulation/ai/board";
import { routesFor } from "../../src/simulation/ai/routes";
import { decide } from "../../src/simulation/ai/decisions";
import { blockFaces } from "../../src/simulation/ai/wrestle";
import type { Candidate } from "../../src/simulation/candidates";

const plainTarget = { skills: [SkillType.WRESTLE], hasBall: false };

function wrestleBoard(
  attackerSkills: SkillType[],
  target: { skills: SkillType[]; hasBall: boolean; ours?: true } = plainTarget
) {
  const subject = game({
    turn: 3,
    team1Placements: [
      {
        playerIndex: 0,
        x: 8,
        y: 5,
        skills: attackerSkills,
        ...(target.ours && { hasBall: true as const }),
      },
    ],
    team2Placements: [
      {
        playerIndex: 0,
        x: 9,
        y: 5,
        skills: target.skills,
        ...(target.hasBall && { hasBall: true as const }),
      },
      {
        playerIndex: 1,
        x: 18,
        y: 1,
        ...(!(target.hasBall || target.ours) && { hasBall: true as const }),
      },
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
  kind: "decision",
  label: accept ? "accept" : "decline",
  commands: [{ type: "use-reaction", accept }],
}));

function wrestleAnswer(
  subject: ReturnType<typeof wrestleBoard>["subject"],
  self: { id: string; teamId: string },
  opponent: { id: string }
) {
  const index = decide({
    board: readBoard(subject, self.teamId),
    pending: {
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.WRESTLE,
      prompt: "Use Wrestle to place both players prone (no armour rolls)?",
      opponentId: opponent.id,
    },
    candidates: answers,
  });
  return index === null ? null : answers[index]?.label;
}

type BlockFace = "both-down" | "push" | "pow-dodge";

function blockDiceAnswer(
  { subject, ...players }: ReturnType<typeof wrestleBoard>,
  types: BlockFace[],
  teamReroll = false
) {
  const options = types.map((type) => ({ type, icon: "", label: type }));
  const pick = (index: number): Candidate => ({
    kind: "decision",
    label: options[index]?.type ?? "",
    commands: [{ type: "choose-block-result", index }],
  });
  const reroll: Candidate = {
    kind: "decision",
    label: "team reroll",
    commands: [{ type: "team-reroll-block", attackerId: players.attacker.id }],
  };
  const candidates = [
    ...options.map((_, index) => pick(index)),
    ...(teamReroll ? [reroll] : []),
  ];
  const picked = decide({
    board: readBoard(subject, players.attacker.teamId),
    pending: {
      type: "block-dice",
      attackerId: players.attacker.id,
      defenderId: players.defender.id,
      chooserTeamId: players.attacker.teamId,
      options,
      choiceStage: "pick",
    },
    candidates,
  });
  return picked === null ? null : candidates[picked]?.label;
}

function hungryVampire() {
  const board = wrestleBoard([SkillType.WRESTLE], {
    skills: [SkillType.BLOCK],
    hasBall: true,
  });
  board.subject.ctx.gameService.getState().activePlayer = {
    id: board.attacker.id,
    action: "block",
    bloodlustUnsated: true,
  };
  return board;
}

function oddsOf(
  { subject, attacker, defender }: ReturnType<typeof wrestleBoard>,
  teamReroll: boolean
) {
  return blockOdds({
    dice: 1,
    attackerPicks: true,
    teamReroll,
    faces: blockFaces(readBoard(subject, attacker.teamId), {
      attacker,
      defender,
    }),
  });
}

describe("Wrestle", () => {
  it("prices a Wrestle attacker's Both Down as the target down and no turnover", () => {
    const { subject, attacker, defender } = wrestleBoard([SkillType.WRESTLE]);
    expect(
      blockOdds({
        dice: 1,
        attackerPicks: true,
        teamReroll: false,
        faces: blockFaces(readBoard(subject, attacker.teamId), {
          attacker,
          defender,
        }),
      })
    ).toEqual({ knockdown: 3 / 6, attackerDown: 1 / 6 });
  });

  it("prices two dice by the face the dice choice would keep", () => {
    const { subject, attacker, defender } = wrestleBoard([SkillType.WRESTLE], {
      skills: [SkillType.BLOCK],
      hasBall: false,
    });
    const odds = blockOdds({
      dice: 2,
      attackerPicks: true,
      teamReroll: false,
      faces: blockFaces(readBoard(subject, attacker.teamId), {
        attacker,
        defender,
      }),
    });
    expect(odds.knockdown).toBeCloseTo(23 / 36, 6);
  });

  it("wrestles a carrier with Block when a hungry Vampire without Block falls either way", () => {
    const { subject, attacker, defender } = wrestleBoard([SkillType.WRESTLE], {
      skills: [SkillType.BLOCK],
      hasBall: true,
    });
    subject.ctx.gameService.getState().activePlayer = {
      id: attacker.id,
      action: "block",
      bloodlustUnsated: true,
    };
    expect(wrestleAnswer(subject, attacker, defender)).toBe("accept");
  });

  it("prices a hungry Vampire's Wrestle as a turnover and keeps Defender Stumbles", () => {
    const vampire = hungryVampire();
    expect(oddsOf(vampire, false)).toEqual({
      knockdown: 3 / 6,
      attackerDown: 2 / 6,
    });
    expect(blockDiceAnswer(vampire, ["both-down", "pow-dodge"])).toBe(
      "pow-dodge"
    );
  });

  it("rerolls a hungry Vampire's lone Both Down and prices the reroll that way", () => {
    const vampire = hungryVampire();
    expect(blockDiceAnswer(vampire, ["both-down"], true)).toBe("team reroll");
    const odds = oddsOf(vampire, true);
    expect(odds.knockdown).toBeCloseTo(3 / 6, 9);
    expect(odds.attackerDown).toBeCloseTo(1 / 9, 9);
  });

  it("takes Both Down against a Distracted defender whose Wrestle is lost", () => {
    const board = wrestleBoard([SkillType.BLOCK]);
    board.defender.conditions = [{ type: PlayerCondition.DISTRACTED }];
    expect(blockDiceAnswer(board, ["both-down", "push"])).toBe("both-down");
  });

  it("keeps its own carrier standing instead of wrestling with Block against Block", () => {
    const { subject, attacker, defender } = wrestleBoard(
      [SkillType.BLOCK, SkillType.WRESTLE],
      { skills: [SkillType.BLOCK], hasBall: false, ours: true }
    );
    expect(wrestleAnswer(subject, attacker, defender)).toBe("decline");
  });

  it("does not count Wrestle in a hungry Vampire's odds against a carrier with Block", () => {
    const { subject, attacker, defender } = wrestleBoard(
      [SkillType.BLOCK, SkillType.WRESTLE],
      { skills: [SkillType.BLOCK], hasBall: true }
    );
    subject.ctx.gameService.getState().activePlayer = {
      id: attacker.id,
      action: "block",
      bloodlustUnsated: true,
    };
    const odds = blockOdds({
      dice: 1,
      attackerPicks: true,
      teamReroll: false,
      faces: blockFaces(readBoard(subject, attacker.teamId), {
        attacker,
        defender,
      }),
    });
    expect(odds.knockdown).toBeCloseTo(2 / 6, 6);
  });

  it("wrestles as an attacker without Block", () => {
    const { subject, attacker, defender } = wrestleBoard([SkillType.WRESTLE]);
    expect(wrestleAnswer(subject, attacker, defender)).toBe("accept");
  });

  it("does not wrestle as a defender when the attacker would take the turnover", () => {
    const { subject, attacker, defender } = wrestleBoard([]);
    expect(wrestleAnswer(subject, defender, attacker)).toBe("decline");
  });

  it("wrestles as a defender when the attacker's Block would keep it standing", () => {
    const { subject, attacker, defender } = wrestleBoard([SkillType.BLOCK]);
    expect(wrestleAnswer(subject, defender, attacker)).toBe("accept");
  });

  it("picks Both Down against a carrier with Block and wrestles the ball loose", () => {
    const board = wrestleBoard([SkillType.BLOCK, SkillType.WRESTLE], {
      skills: [SkillType.BLOCK],
      hasBall: true,
    });
    expect(blockDiceAnswer(board, ["both-down", "push"])).toBe("both-down");
    expect(wrestleAnswer(board.subject, board.attacker, board.defender)).toBe(
      "accept"
    );
  });

  it("keeps Both Down plain against a defender without Block", () => {
    const { subject, attacker, defender } = wrestleBoard(
      [SkillType.BLOCK, SkillType.WRESTLE],
      { skills: [], hasBall: true }
    );
    expect(wrestleAnswer(subject, attacker, defender)).toBe("decline");
  });

  it("keeps a hungry Vampire with Block standing instead of wrestling a carrier", () => {
    const { subject, attacker, defender } = wrestleBoard(
      [SkillType.BLOCK, SkillType.WRESTLE],
      { skills: [SkillType.BLOCK], hasBall: true }
    );
    expect(wrestleAnswer(subject, attacker, defender)).toBe("accept");
    subject.ctx.gameService.getState().activePlayer = {
      id: attacker.id,
      action: "block",
      bloodlustUnsated: true,
    };
    expect(wrestleAnswer(subject, attacker, defender)).toBe("decline");
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

  it("does not let an opposing Titchy player mark the square a dodger enters", () => {
    const subject = game({
      turn: 3,
      team1Placements: [{ playerIndex: 0, x: 10, y: 5, stats: { AG: 3 } }],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 5, skills: [SkillType.TITCHY] },
        { playerIndex: 1, x: 18, y: 1, hasBall: true },
      ],
    });
    const route = routesFor({
      board: readBoard(subject, subject.ctx.team1.id),
      player: fieldPlayer(subject.ctx.team1.players[0]),
    }).get(key({ x: 10, y: 4 }));
    expect(route?.chance).toBeCloseTo(4 / 6, 6);
  });
});
