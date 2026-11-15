import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { PlayerStatus } from "../../../src/types/Player";
import { SkillType } from "../../../src/types/Skills";
import { forceDice } from "../../utils/test-helpers";
import { eventOrder } from "./eventOrder";

/**
 * The literal events of a Foul, so a refactor of FoulOperation that moves a
 * roll, an emit or a queued operation fails here.
 */
function foulGame(skills: SkillType[], withAssist: boolean) {
  const game = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "foul-event-order",
      name: "foul-event-order",
      description: "",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 10, y: 5, skills },
          ...(withAssist ? [{ playerIndex: 1, x: 11, y: 4 }] : []),
        ],
        team2Placements: [
          {
            playerIndex: 0,
            x: 11,
            y: 5,
            status: PlayerStatus.PRONE,
            stats: { AV: 9 },
          },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    },
  });
  // Argue the Call fails, so a spotted fouler is Sent-off
  vi.spyOn(game.ctx.rng, "rollDie").mockReturnValue(1);
  return { game, fouler: game.ctx.team1.players[0] };
}

async function foul(
  skills: SkillType[],
  dice: number[],
  withAssist = false
): Promise<string[]> {
  const { game, fouler } = foulGame(skills, withAssist);
  forceDice(game.ctx.rng, dice);
  await game.execute({
    type: "declare-action",
    playerId: fouler.id,
    action: "foul",
  });
  let response = await game.execute({
    type: "foul",
    playerId: fouler.id,
    x: 11,
    y: 5,
  });
  const events = [...response.events];
  if (response.pendingDecision?.type === "foul-assists") {
    response = await game.execute({ type: "choose-foul-assists", count: 1 });
    events.push(...response.events);
  }
  return eventOrder(events);
}

describe("a Foul's events keep their order", () => {
  it("breaks armour on a double, injures, and sends the fouler off", async () => {
    // Armour 5+5 breaks AV 9; Injury 4+4 Stunned; spotted on the double
    expect(await foul([], [5, 5, 4, 4], true)).toMatchInlineSnapshot(`
      [
        "ui:notification: Human Lineman #1 is fouling Human Lineman #1!",
        "decisionRequested: type=foul-assists playerId=team1-player-1 targetId=team2-player-1 chooserTeamId=team1",
        "decisionResolved: type=foul-assists",
        "ui:notification: Assists: +1 Offensive, -0 Defensive. Mod: +1",
        "diceRoll: Foul Armour Roll (Human Lineman #1) | Foul Armour Roll (Human Lineman #1): 5 + 5 +1 = 11 (AV 9+) | teamId=team2",
        "ui:notification: ARMOUR BROKEN!",
        "diceRoll: Injury Roll (Human Lineman #1) | Injury Roll (Human Lineman #1): 4 + 4 = 8 | teamId=team2",
        "ui:notification: Injury Roll for Human Lineman #1",
        "ui:notification: KNOCKED OUT!",
        "playerStatusChanged: id=team2-player-1 teamId=team2 status=KO",
        "turnDataUpdated",
        "ui:notification: REFEREE SPOTTED IT! Human Lineman #1 is being sent off!",
        "refereeCall: playerId=team1-player-1 teamId=team1",
        "ui:notification: Coach is Arguing the Call...",
        "diceRoll: Argue the Call | Argue the Call: 1 | teamId=team1",
        "refereeCall: playerId=team1-player-1 teamId=team1",
        "ui:notification: Referee ignores the argument.",
        "playerStatusChanged: id=team1-player-1 teamId=team1 status=Removed",
        "ui:notification: Human Lineman #1 is removed from the pitch.",
        "refereeCall: playerId=team1-player-1 teamId=team1 result=sent-off",
        "ui:logEntry: teamId=team1",
        "turnover: teamId=team1",
        "playerActivated: team1-player-1",
        "actionResolved: playerId=team1-player-1",
        "ui:turnover: teamId=team1",
        "turnEnded: teamId=team1",
        "phaseChanged",
        "turnStarted: teamId=team2",
        "ui:announce: kind=turn-started",
      ]
    `);
  });

  it("re-rolls with Lone Fouler and holds the +1 of Dirty Player", async () => {
    // Armour 2+3 holds, Lone Fouler re-rolls 4+4: Dirty Player +1 breaks it
    expect(
      await foul(
        [SkillType.LONE_FOULER, SkillType.DIRTY_PLAYER],
        [2, 3, 4, 4, 3, 2]
      )
    ).toMatchInlineSnapshot(`
      [
        "ui:notification: Human Lineman #1 is fouling Human Lineman #1!",
        "ui:notification: Assists: +0 Offensive, -0 Defensive. Mod: +0",
        "diceRoll: Foul Armour Roll (Human Lineman #1) | Foul Armour Roll (Human Lineman #1): 2 + 3 = 5 (AV 9+) | teamId=team2",
        "skillTriggered: Lone Fouler: re-roll the failed Armour Roll | playerId=team1-player-1 skill=Lone Fouler",
        "diceRoll: Foul Armour Roll (Human Lineman #1) | Foul Armour Roll (Human Lineman #1): 4 + 4 = 8 (AV 9+) | teamId=team2",
        "skillTriggered: Dirty Player: +1 to the Armour Roll | playerId=team1-player-1 skill=Dirty Player",
        "ui:notification: ARMOUR BROKEN!",
        "diceRoll: Injury Roll (Human Lineman #1) | Injury Roll (Human Lineman #1): 3 + 2 = 5 | teamId=team2",
        "ui:notification: Injury Roll for Human Lineman #1",
        "ui:notification: STUNNED!",
        "playerStatusChanged: id=team2-player-1 teamId=team2 status=Stunned gridPosition=11,5",
        "turnDataUpdated",
        "ui:notification: REFEREE SPOTTED IT! Human Lineman #1 is being sent off!",
        "refereeCall: playerId=team1-player-1 teamId=team1",
        "ui:notification: Coach is Arguing the Call...",
        "diceRoll: Argue the Call | Argue the Call: 1 | teamId=team1",
        "refereeCall: playerId=team1-player-1 teamId=team1",
        "ui:notification: Referee ignores the argument.",
        "playerStatusChanged: id=team1-player-1 teamId=team1 status=Removed",
        "ui:notification: Human Lineman #1 is removed from the pitch.",
        "refereeCall: playerId=team1-player-1 teamId=team1 result=sent-off",
        "ui:logEntry: teamId=team1",
        "turnover: teamId=team1",
        "playerActivated: team1-player-1",
        "actionResolved: playerId=team1-player-1",
        "ui:turnover: teamId=team1",
        "turnEnded: teamId=team1",
        "phaseChanged",
        "turnStarted: teamId=team2",
        "ui:announce: kind=turn-started",
      ]
    `);
  });

  it("keeps a Sneaky Git on when a double holds", async () => {
    expect(await foul([SkillType.SNEAKY_GIT, SkillType.QUICK_FOUL], [2, 2]))
      .toMatchInlineSnapshot(`
      [
        "ui:notification: Human Lineman #1 is fouling Human Lineman #1!",
        "ui:notification: Assists: +0 Offensive, -0 Defensive. Mod: +0",
        "diceRoll: Foul Armour Roll (Human Lineman #1) | Foul Armour Roll (Human Lineman #1): 2 + 2 = 4 (AV 9+) | teamId=team2",
        "ui:notification: Armour Holds.",
        "skillTriggered: Sneaky Git: not Sent-off on an unbroken double | playerId=team1-player-1 skill=Sneaky Git",
        "turnDataUpdated",
        "skillTriggered: Quick Foul: the activation continues after the Foul | playerId=team1-player-1 skill=Quick Foul",
      ]
    `);
  });
});
