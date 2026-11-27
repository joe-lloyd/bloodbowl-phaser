import { DEFAULT_SEVENS_RULESET } from "../game/rules/sevensRuleset";
import type { CompetitionContext, CompetitionDoc, FixturePlay } from "./types";

export function fixtureContext({
  competition,
  fixtureId,
  playedVia,
}: {
  competition: CompetitionDoc;
  fixtureId: string;
  playedVia: FixturePlay;
}): CompetitionContext {
  return {
    ruleset: competition.ruleset ?? DEFAULT_SEVENS_RULESET,
    ...(competition.gameType !== undefined && { gameType: competition.gameType }),
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
