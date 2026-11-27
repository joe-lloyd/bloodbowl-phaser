import { fieldPlayer } from "./fixtures";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type HeadlessCommand } from "../../src/headless/protocol";
import { type ScenarioSetup } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PositionKeyWord, TraitKeyWord } from "../../src/types/Player";
import { SkillType, getSkill } from "../../src/types/Skills";
import { enumerateDecision } from "../../src/simulation/candidates";
import {
  plannerCoach,
  createPlannerCoach,
} from "../../src/simulation/ai/planner";
import { createCoachRng } from "../../src/simulation/rng";
import { chain } from "../../src/simulation/ai/chance";
import { context } from "../../src/simulation/ai/activationContext";
import { readBoard } from "../../src/simulation/ai/board";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import { carrierActivations } from "../../src/simulation/ai/ballActivations";
import { repositionActivation } from "../../src/simulation/ai/repositionActivations";
import { secureBallActivations } from "../../src/simulation/ai/skillActivations";
import { secureBallTarget } from "../../src/game/rules/rollPreview";

function game(
  setup: Partial<Omit<ScenarioSetup, "ballPosition">> & {
    ballPosition?: ScenarioSetup["ballPosition"];
  } = {}
) {
  const { ballPosition, ...rest } = setup;
  return new HeadlessGame({
    seed: 1,
    scenario: {
      id: "skill-plans",
      name: "Tactical skill choices",
      description: "",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 3, y: 5, stats: { AG: 5, MA: 6 } },
        ],
        team2Placements: [{ playerIndex: 0, x: 15, y: 8 }],
        ...(!("ballPosition" in setup) && { ballPosition: { x: 6, y: 5 } }),
        ...(ballPosition && { ballPosition }),
        activeTeam: "team1",
        turn: 6,
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        teamRerolls: { team1: 0, team2: 0 },
        ...rest,
      },
    },
  });
}

async function choose(
  subject: HeadlessGame,
  legacy = false
): Promise<HeadlessCommand> {
  const point = await enumerateDecision(subject, null);
  const coach = legacy
    ? createPlannerCoach({ skillPlans: false })
    : plannerCoach;
  const choice = await coach.choose({
    game: subject,
    snapshot: subject.snapshot(),
    point,
    rng: createCoachRng(1),
  });
  const command = fixtureValue(point.candidates[choice.index]).commands[0];
  const response = await subject.execute(command);
  expect(response.ok, JSON.stringify(command)).toBe(true);
  return command;
}

describe("skill-aware tactical choices", () => {
  it("charges a new unsupported carrier move for Bloodlust once", () => {
    const subject = game({
      turn: 1,
      team1Placements: [
        {
          playerIndex: 0,
          x: 3,
          y: 5,
          stats: { MA: 1 },
          hasBall: true,
          skills: [SkillType.BLOODLUST],
        },
      ],
      ballPosition: undefined,
    });
    const player = subject.ctx.teams[0].players[0];
    const c = context({
      board: readBoard(subject, fieldPlayer(player).teamId),
      w: DEFAULT_WEIGHTS,
      available: new Map([
        [fieldPlayer(player).id, new Set(["move" as const])],
      ]),
    });
    const ordinary = carrierActivations(
      { ...c, skillPlans: false },
      fieldPlayer(player)
    );
    expect(ordinary.some((a) => a.intent.kind === "carrier")).toBe(true);

    expect(
      carrierActivations(c, fieldPlayer(player)).filter(
        (a) => a.intent.kind === "carrier"
      )
    ).toEqual([]);
  });

  it("does not spend a new unsupported Vampire activation on a small role gain", () => {
    const subject = game({
      team1Placements: [
        { playerIndex: 0, x: 3, y: 5, skills: [SkillType.BLOODLUST] },
      ],
    });
    const player = subject.ctx.teams[0].players[0];
    const c = context({
      board: readBoard(subject, fieldPlayer(player).teamId),
      w: DEFAULT_WEIGHTS,
      available: new Map([
        [fieldPlayer(player).id, new Set(["move" as const])],
      ]),
    });
    expect(
      repositionActivation(c, fieldPlayer(player), [
        { at: { x: 4, y: 5 }, role: "screen", value: 6 },
      ])
    ).toEqual([]);
  });

  it("discounts an unsupported goal-line secure pickup by its unfed scoring risk", () => {
    const subject = game({
      team1Placements: [
        {
          playerIndex: 0,
          x: 17,
          y: 5,
          stats: { AG: 5 },
          skills: [SkillType.BLOODLUST],
        },
      ],
      ballPosition: { x: 19, y: 5 },
      team2Placements: [{ playerIndex: 0, x: 2, y: 8 }],
    });
    const player = subject.ctx.teams[0].players[0];
    const c = context({
      board: readBoard(subject, fieldPlayer(player).teamId),
      w: DEFAULT_WEIGHTS,
      available: new Map([
        [fieldPlayer(player).id, new Set(["secureBall" as const])],
      ]),
    });
    const plans = secureBallActivations(c, fieldPlayer(player));
    expect(plans).toHaveLength(1);

    expect(fixtureValue(plans[0]).value).toBeCloseTo(
      (5 / 6) * (2 / 3) * 100 -
        (1 / 6) * (c.turnover + c.w.ownDown) -
        (1 / 3) * (c.turnover + c.w.ownDown + c.w.ballLoss)
    );
  });

  it("secures a hard pickup and completes the route", async () => {
    const subject = game({ turn: 1 });
    expect(await choose(subject)).toMatchObject({
      type: "declare-action",
      action: "secureBall",
    });
    const commands = [];
    for (
      let i = 0;
      i < 12 &&
      (subject.ctx.gameService.getState().activePlayer ||
        subject.pendingDecision());
      i++
    )
      commands.push(await choose(subject));
    expect(
      commands.some((c) => c.type === "move" && c.path.at(-1)?.x === 6)
    ).toBe(true);
    expect(subject.ctx.gameService.getState().activePlayer).toBeNull();
  });

  it("retains a normal pickup when movement can score this turn", async () => {
    const subject = game({
      team1Placements: [
        { playerIndex: 0, x: 16, y: 5, stats: { MA: 6, AG: 2 } },
      ],
      ballPosition: { x: 17, y: 5 },
    });
    expect(await choose(subject)).toMatchObject({
      type: "declare-action",
      action: "move",
    });
  });

  it("can secure possession on the last turn when scoring is out of reach", async () => {
    expect(await choose(game({ turn: 6 }))).toMatchObject({
      type: "declare-action",
      action: "secureBall",
    });
  });

  it("preserves the team reroll after a failed non-turnover gaze", async () => {
    const subject = new HeadlessGame({
      seed: 8,
      scenario: {
        id: "gaze-resource",
        name: "Gaze resource decision",
        description: "",
        setup: {
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.HYPNOTIC_GAZE] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          ballPosition: { x: 1, y: 1 },
          teamRerolls: { team1: 2, team2: 0 },
        },
      },
    });
    const gazer = subject.ctx.teams[0].players[0];
    await subject.execute({
      type: "declare-action",
      action: "gaze",
      playerId: fixtureValue(gazer).id,
    });
    await subject.execute({
      type: "special-action",
      action: "gaze",
      attackerId: fixtureValue(gazer).id,
      defenderId: fixtureValue(subject.ctx.teams[1].players[0]).id,
    });
    expect(subject.pendingDecision()).toMatchObject({
      type: "reroll",
      rollKind: "gaze",
    });
    expect(await choose(subject)).toMatchObject({
      type: "use-reroll",
      accept: false,
    });
    expect(fixtureValue(subject.snapshot().teams[0]).rerolls).toBe(2);
  });

  it("does not offer securing when the ball is contested", async () => {
    const subject = game({ team2Placements: [{ playerIndex: 0, x: 7, y: 5 }] });
    const point = await enumerateDecision(subject, null);
    expect(
      point.candidates.some(
        (c) =>
          c.commands[0].type === "declare-action" &&
          c.commands[0].action === "secureBall"
      )
    ).toBe(false);
  });

  it("does not offer an Unsteady player a securing action the engine refuses", async () => {
    const subject = game({
      team1Placements: [
        { playerIndex: 0, x: 3, y: 5, skills: [SkillType.UNSTEADY] },
      ],
    });
    const point = await enumerateDecision(subject, null);
    expect(
      point.candidates.some(
        (c) =>
          c.commands[0].type === "declare-action" &&
          c.commands[0].action === "secureBall"
      )
    ).toBe(false);
    expect(await choose(subject)).not.toMatchObject({
      type: "declare-action",
      action: "secureBall",
    });
  });

  it("opens a marked carrier's scoring line with the useful gaze target", async () => {
    const subject = game({
      team1Placements: [
        { playerIndex: 0, x: 17, y: 6, skills: [SkillType.HYPNOTIC_GAZE] },
        { playerIndex: 1, x: 18, y: 5, stats: { MA: 1, AG: 4 }, hasBall: true },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 6 }],
      ballPosition: undefined,
    });
    expect(await choose(subject)).toMatchObject({
      type: "declare-action",
      action: "gaze",
      playerId: fixtureValue(subject.ctx.teams[0].players[0]).id,
    });
    expect(await choose(subject)).toMatchObject({
      type: "special-action",
      action: "gaze",
      defenderId: fixtureValue(subject.ctx.teams[1].players[0]).id,
    });
  });

  it("leaves an irrelevant gaze alone when the carrier can score freely", async () => {
    const subject = game({
      team1Placements: [
        { playerIndex: 0, x: 8, y: 6, skills: [SkillType.HYPNOTIC_GAZE] },
        { playerIndex: 1, x: 18, y: 1, stats: { MA: 1 }, hasBall: true },
      ],
      team2Placements: [{ playerIndex: 0, x: 9, y: 6 }],
      ballPosition: undefined,
    });
    expect(await choose(subject)).toMatchObject({
      type: "declare-action",
      action: "move",
      playerId: fixtureValue(subject.ctx.teams[0].players[1]).id,
    });
  });

  it("does not gaze when the teammate who could exploit it has already acted", async () => {
    const subject = game({
      team1Placements: [
        { playerIndex: 0, x: 17, y: 6, skills: [SkillType.HYPNOTIC_GAZE] },
        { playerIndex: 1, x: 18, y: 5, hasBall: true },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 6 }],
      ballPosition: undefined,
    });
    subject.ctx.gameService
      .getState()
      .turn.activatedPlayerIds.add(
        fixtureValue(subject.ctx.teams[0].players[1]).id
      );
    expect(await choose(subject)).not.toMatchObject({
      type: "declare-action",
      action: "gaze",
    });
  });

  it("uses Multiple Block when both reduced-strength hits are worthwhile", async () => {
    const subject = game({
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { ST: 7 },
          skills: [SkillType.MULTIPLE_BLOCK, SkillType.BLOCK],
        },
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 5, stats: { ST: 1 } },
        { playerIndex: 1, x: 10, y: 6, stats: { ST: 1 } },
      ],
      ballPosition: { x: 1, y: 1 },
    });
    expect(await choose(subject)).toMatchObject({
      type: "declare-action",
      action: "multipleBlock",
    });
    expect(await choose(subject)).toMatchObject({
      type: "multiple-block",
      defender1Id: fixtureValue(subject.ctx.teams[1].players[0]).id,
      defender2Id: fixtureValue(subject.ctx.teams[1].players[1]).id,
    });
  });

  it("rejects dangerous reduced-strength double blocks", async () => {
    const subject = game({
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { ST: 3 },
          skills: [SkillType.MULTIPLE_BLOCK],
        },
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 5, stats: { ST: 3 } },
        { playerIndex: 1, x: 10, y: 6, stats: { ST: 3 } },
      ],
      ballPosition: { x: 1, y: 1 },
    });
    expect(await choose(subject)).not.toMatchObject({
      type: "declare-action",
      action: "multipleBlock",
    });
  });

  it("does not offer Multiple Block for one target", async () => {
    const subject = game({
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, skills: [SkillType.MULTIPLE_BLOCK] },
      ],
      team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    });
    const point = await enumerateDecision(subject, null);
    expect(
      point.candidates.some(
        (c) =>
          c.commands[0].type === "declare-action" &&
          c.commands[0].action === "multipleBlock"
      )
    ).toBe(false);
  });

  it("a failed-Bloodlust carrier moves towards legal food instead of abandoning it", async () => {
    const subject = game({
      turn: 1,
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { MA: 2, AG: 2 },
          skills: [SkillType.BLOODLUST],
          hasBall: true,
        },
        { playerIndex: 1, x: 9, y: 3 },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
      ballPosition: undefined,
    });
    const [vampire, thrall] = subject.ctx.teams[0].players;
    fixtureValue(thrall).keywords = [
      TraitKeyWord.THRALL,
      PositionKeyWord.LINEMAN,
    ];
    const state = subject.ctx.gameService.getState();
    state.activePlayer = {
      id: fixtureValue(vampire).id,
      action: "move",
      committed: true,
      bloodlustUnsated: true,
    };
    const command = await choose(subject);
    expect(command.type).toBe("move");
    if (command.type === "move")
      expect(
        Math.max(
          Math.abs(fixtureValue(command.path[0]).x - 9),
          Math.abs(fixtureValue(command.path[0]).y - 3)
        )
      ).toBe(1);
  });

  it("keeps the frozen policy available for confirmation", async () => {
    expect(await choose(game({ turn: 1 }), true)).not.toMatchObject({
      type: "declare-action",
      action: "secureBall",
    });
  });

  it("keeps a supported gaze after failed Bloodlust instead of downgrading it", async () => {
    const subject = new HeadlessGame({
      seed: 7,
      scenario: {
        id: "supported-gaze",
        name: "Supported gaze",
        description: "",
        setup: {
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [
                SkillType.HYPNOTIC_GAZE,
                { type: SkillType.BLOODLUST, parameter: "2+" },
              ],
            },
            { playerIndex: 1, x: 9, y: 5 },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          ballPosition: { x: 1, y: 1 },
          teamRerolls: { team1: 0, team2: 0 },
        },
      },
    });
    const [vampire, thrall] = subject.ctx.teams[0].players;
    fixtureValue(thrall).keywords = [
      TraitKeyWord.THRALL,
      PositionKeyWord.LINEMAN,
    ];
    await subject.execute({
      type: "declare-action",
      action: "gaze",
      playerId: fixtureValue(vampire).id,
    });
    expect(subject.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.BLOODLUST,
    });
    expect(await choose(subject)).toMatchObject({
      type: "use-reaction",
      accept: false,
    });
    expect(subject.ctx.gameService.getState().activePlayer?.action).toBe(
      "gaze"
    );
  });

  it("chooses a non-carrier Thrall when both are legal bite targets", async () => {
    const subject = new HeadlessGame({
      seed: 7,
      scenario: {
        id: "safe-bite",
        name: "Preserve the carrier",
        description: "",
        setup: {
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [{ type: SkillType.BLOODLUST, parameter: "2+" }],
            },
            { playerIndex: 1, x: 11, y: 5, hasBall: true },
            { playerIndex: 2, x: 10, y: 6 },
          ],
          team2Placements: [{ playerIndex: 0, x: 2, y: 8 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          teamRerolls: { team1: 0, team2: 0 },
        },
      },
    });
    const [vampire, carrier, food] = subject.ctx.teams[0].players;
    for (const p of [carrier, food])
      fixtureValue(p).keywords = [TraitKeyWord.THRALL, PositionKeyWord.LINEMAN];
    await subject.execute({
      type: "declare-action",
      action: "move",
      playerId: fixtureValue(vampire).id,
    });
    await subject.execute({ type: "use-reaction", accept: false });
    await subject.execute({
      type: "end-activation",
      playerId: fixtureValue(vampire).id,
    });
    expect(subject.pendingDecision()).toMatchObject({ type: "bite-target" });
    expect(await choose(subject)).toMatchObject({
      type: "choose-bite-target",
      playerId: fixtureValue(food).id,
    });
    expect(subject.ctx.gameService.getState().ballPosition).toEqual(
      fixtureValue(carrier).gridPosition
    );
  });

  it("keeps a Block after failed Bloodlust when a Thrall stands beside the Vampire", async () => {
    const subject = new HeadlessGame({
      seed: 7,
      scenario: {
        id: "supported-block",
        name: "Supported block",
        description: "",
        setup: {
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [{ type: SkillType.BLOODLUST, parameter: "6+" }],
            },
            { playerIndex: 1, x: 9, y: 5 },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          ballPosition: { x: 1, y: 1 },
          teamRerolls: { team1: 0, team2: 0 },
        },
      },
    });
    const [vampire, thrall] = subject.ctx.teams[0].players;
    fixtureValue(thrall).keywords = [
      TraitKeyWord.THRALL,
      PositionKeyWord.LINEMAN,
    ];
    await subject.execute({
      type: "declare-action",
      action: "block",
      playerId: fixtureValue(vampire).id,
    });
    expect(subject.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.BLOODLUST,
    });
    expect(await choose(subject)).toMatchObject({
      type: "use-reaction",
      accept: false,
    });
  });

  it("walks a failed-Bloodlust Vampire to a Thrall it can bite", async () => {
    const subject = game({
      turn: 1,
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          skills: [SkillType.BLOODLUST],
        },
        { playerIndex: 1, x: 7, y: 2 },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 8, hasBall: true }],
      ballPosition: undefined,
    });
    const [vampire, thrall] = subject.ctx.teams[0].players;
    fixtureValue(thrall).keywords = [
      TraitKeyWord.THRALL,
      PositionKeyWord.LINEMAN,
    ];
    subject.ctx.gameService.getState().activePlayer = {
      id: fixtureValue(vampire).id,
      action: "move",
      committed: true,
      bloodlustUnsated: true,
    };
    for (let step = 0; step < 8; step++) {
      const command = await choose(subject);
      if (command.type !== "move") break;
    }
    const end = fixtureValue(fixtureValue(vampire).gridPosition);
    expect(Math.max(Math.abs(end.x - 7), Math.abs(end.y - 2))).toBe(1);
  });

  it("does not bite the only adjacent Thrall when it holds the ball", async () => {
    const subject = new HeadlessGame({
      seed: 7,
      scenario: {
        id: "carrier-bite",
        name: "Spare the carrier",
        description: "",
        setup: {
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [{ type: SkillType.BLOODLUST, parameter: "2+" }],
            },
            { playerIndex: 1, x: 11, y: 5, hasBall: true },
          ],
          team2Placements: [{ playerIndex: 0, x: 2, y: 8 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          teamRerolls: { team1: 0, team2: 0 },
        },
      },
    });
    const [vampire, carrier] = subject.ctx.teams[0].players;
    fixtureValue(carrier).keywords = [
      TraitKeyWord.THRALL,
      PositionKeyWord.LINEMAN,
    ];
    await subject.execute({
      type: "declare-action",
      action: "move",
      playerId: fixtureValue(vampire).id,
    });
    await subject.execute({ type: "use-reaction", accept: false });
    await subject.execute({
      type: "end-activation",
      playerId: fixtureValue(vampire).id,
    });
    expect(subject.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.BLOODLUST,
    });
    expect(await choose(subject)).toMatchObject({
      type: "use-reaction",
      accept: false,
    });
  });

  it("moves a Thrall into future feeding range and leaves it there", async () => {
    const subject = game({
      turn: 1,
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { MA: 6, AG: 2 },
          skills: [SkillType.BLOODLUST],
          hasBall: true,
        },
        { playerIndex: 1, x: 10, y: 3, stats: { MA: 8 } },
      ],
      team2Placements: [{ playerIndex: 0, x: 2, y: 8 }],
      ballPosition: undefined,
    });
    const [vampire, thrall] = subject.ctx.teams[0].players;
    fixtureValue(thrall).keywords = [
      TraitKeyWord.THRALL,
      PositionKeyWord.LINEMAN,
    ];
    expect(await choose(subject)).toMatchObject({
      type: "declare-action",
      action: "move",
      playerId: fixtureValue(thrall).id,
    });
    for (
      let i = 0;
      i < 20 &&
      (subject.ctx.gameService.getState().activePlayer ||
        subject.pendingDecision());
      i++
    )
      await choose(subject);
    expect(subject.ctx.gameService.getState().activePlayer).toBeNull();
    expect(fixtureValue(fixtureValue(thrall).gridPosition).x).toBeGreaterThan(
      12
    );
    expect(await choose(subject)).toMatchObject({
      type: "declare-action",
      action: "move",
      playerId: fixtureValue(vampire).id,
    });
  });

  it("prices securing as a D6 without Sure Hands or Extra Arms", () => {
    const subject = game();
    const player = subject.ctx.teams[0].players[0];
    fieldPlayer(player).skills = [
      getSkill(SkillType.SURE_HANDS),
      getSkill(SkillType.EXTRA_ARMS),
    ];
    expect(
      chain({
        player: fieldPlayer(player),
        rolls: [{ kind: "secure", target: 2 }],
        teamReroll: false,
      })
    ).toBeCloseTo(5 / 6);
    expect(
      chain({
        player: fieldPlayer(player),
        rolls: [{ kind: "secure", target: 2 }],
        teamReroll: true,
      })
    ).toBeCloseTo(35 / 36);
    expect(
      secureBallTarget(fieldPlayer(player), { x: 6, y: 5 }, [], {
        ...subject.ctx.gameService.getState(),
        weather: "Pouring Rain",
      })
    ).toBe(3);
    fieldPlayer(player).skills.push(getSkill(SkillType.BIG_HAND));
    expect(
      secureBallTarget(fieldPlayer(player), { x: 6, y: 5 }, [], {
        ...subject.ctx.gameService.getState(),
        weather: "Pouring Rain",
      })
    ).toBe(2);
  });
});
