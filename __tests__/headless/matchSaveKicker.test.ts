import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { type Coach } from "../../src/simulation/coach";
import { runMatch } from "../../src/simulation/runMatch";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";

describe("the kicking team in a match save", () => {
  it("is the coming drive's at every set-up and kick-off", async () => {
    const planner = createPlannerCoach();
    const seen: { saved: string; setupTeamId: string | null }[] = [];
    const watching: Coach = {
      name: "watching",
      async choose(context) {
        const { game, point } = context;
        const setupTeamId = game.ctx.gameService.getState().setup?.kickingTeamId;
        if (
          (point.phase === GamePhase.SETUP ||
            point.phase === GamePhase.KICKOFF) &&
          setupTeamId
        )
          seen.push({ saved: game.matchSave().drive.kickingTeamId, setupTeamId });
        return planner.choose(context);
      },
    };
    await runMatch({
      seed: 4,
      rosters: [RosterName.HUMAN, RosterName.SKAVEN],
      coaches: [watching, watching],
    });

    expect(new Set(seen.map((s) => s.setupTeamId)).size).toBe(2);
    expect(seen.filter((s) => s.saved !== s.setupTeamId)).toEqual([]);
  }, 30_000);

  it("keeps a kicker the game was given before any drive began", () => {
    const game = new HeadlessGame({
      scenario: {
        id: "kicker",
        name: "Kicker",
        description: "",
        setup: {
          team1Placements: [{ playerIndex: 0, x: 5, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        },
      },
      seed: 1,
      kickingTeamId: "team2",
    });
    const kicker = game.ctx.team2.id;
    expect(game.driveKickingTeamId()).toBe(kicker);

    const save = game.matchSave();
    expect(save.drive.kickingTeamId).toBe(kicker);
    expect(new HeadlessGame({ matchSave: save }).driveKickingTeamId()).toBe(
      kicker
    );
  });
});
