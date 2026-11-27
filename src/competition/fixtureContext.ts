import { DEFAULT_SEVENS_RULESET } from "../game/rules/sevensRuleset";
import { readGameType, type GameType } from "../game/variants/gameTypes";
import type {
  CompetitionContext,
  CompetitionDoc,
  CompetitionFixture,
  FixturePlay,
} from "./types";

type GameTypeSource = Pick<CompetitionDoc, "gameType" | "fixtures">;

export function fixtureGameType(
  competition: Pick<CompetitionDoc, "gameType">,
  fixture: Pick<CompetitionFixture, "gameType"> | undefined
): GameType {
  return readGameType(fixture?.gameType ?? competition.gameType);
}

export function competitionGameTypes(competition: GameTypeSource): GameType[] {
  const byRound = [...competition.fixtures].sort((a, b) => a.round - b.round);
  const played = byRound.map((fixture) => fixtureGameType(competition, fixture));
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
  const gameType = fixture?.gameType ?? competition.gameType;
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
