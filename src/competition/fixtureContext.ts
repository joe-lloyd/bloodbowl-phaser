import { DEFAULT_SEVENS_RULESET } from "../game/rules/sevensRuleset";
import { readGameType, type GameType } from "../game/variants/gameTypes";
import type {
  CompetitionContext,
  CompetitionDoc,
  CompetitionFixture,
  FixturePlay,
} from "./types";

type GameTypeSource = Pick<CompetitionDoc, "gameType" | "gameTypePool">;

function drawnGameType(
  competition: GameTypeSource,
  fixture: Pick<CompetitionFixture, "gameType" | "round"> | undefined
): GameType | undefined {
  if (fixture?.gameType) return fixture.gameType;
  if (fixture && competition.gameTypePool)
    throw new Error(
      `Round ${String(fixture.round)}'s game type is drawn when round ${String(fixture.round - 1)} is over.`
    );
  return competition.gameType;
}

export function fixtureGameType(
  competition: GameTypeSource,
  fixture: Pick<CompetitionFixture, "gameType" | "round"> | undefined
): GameType {
  return readGameType(drawnGameType(competition, fixture));
}

export function competitionGameTypes(
  competition: GameTypeSource & Pick<CompetitionDoc, "fixtures">
): GameType[] {
  const byRound = [...competition.fixtures].sort((a, b) => a.round - b.round);
  const played = byRound.flatMap((fixture) =>
    fixture.gameType ?? (competition.gameTypePool ? [] : readGameType(competition.gameType))
  );
  return played.length > 0
    ? [...new Set(played)]
    : [readGameType(competition.gameType)];
}

export function fixtureContext({
  competition,
  fixtureId,
  playedVia,
}: {
  competition: CompetitionDoc;
  fixtureId: string;
  playedVia: FixturePlay;
}): CompetitionContext {
  const fixture = competition.fixtures.find((each) => each.id === fixtureId);
  const gameType = drawnGameType(competition, fixture);
  return {
    ruleset: competition.ruleset ?? DEFAULT_SEVENS_RULESET,
    ...(gameType !== undefined && { gameType }),
    competitionType: competition.type,
    competitionId: competition.id,
    fixtureId,
    playedVia,
    ...(competition.type === "tournament" &&
    competition.format === "single-elimination" && { knockout: true }),
    ...(competition.type === "tournament" &&
      competition.playOffs && { playOffs: true }),
  };
}
