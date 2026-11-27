import {
  DEFAULT_SEVENS_RULESET,
  SEVENS_RULESET_LABELS,
} from "../../../game/rules/sevensRuleset";
import {
  GAME_TYPE_LABELS,
  GAME_TYPE_SUMMARIES,
  type GameType,
} from "../../../game/variants/gameTypes";
import { type CompetitionDoc } from "../../../competition/types";
import { competitionGameTypes } from "../../../competition/fixtureContext";

type RulesLineCompetition = Pick<
  CompetitionDoc,
  "gameType" | "ruleset" | "online" | "fixtures" | "gameTypePool"
>;

const labels = (gameTypes: readonly GameType[]) =>
  gameTypes.map((gameType) => GAME_TYPE_LABELS[gameType]).join(", ");

function onlineNote({ online }: RulesLineCompetition): string {
  if (!online) return "";
  const days = online.roundDays === 1 ? "day" : "days";
  return ` · Online: ${String(online.places)} places, one round every ${String(online.roundDays)} ${days}.`;
}

export function CompetitionRulesLine({
  competition,
}: {
  competition: RulesLineCompetition;
}) {
  if (competition.gameTypePool) {
    return (
      <p className="mb-6 font-hud-body text-hud-sm text-hud-dim">
        Random game types: each round is drawn from {labels(competition.gameTypePool)} when
        it comes up.
        {onlineNote(competition)}
      </p>
    );
  }
  const gameTypes = competitionGameTypes(competition);
  if (gameTypes.length > 1) {
    return (
      <p className="mb-6 font-hud-body text-hud-sm text-hud-dim">
        Mixed game types: {labels(gameTypes)}. Each round shows the game type it
        is played in.
        {onlineNote(competition)}
      </p>
    );
  }
  if (competition.gameType !== undefined && competition.gameType !== "sevens") {
    return (
      <p className="mb-6 font-hud-body text-hud-sm text-hud-dim">
        {GAME_TYPE_LABELS[competition.gameType]}
        {" · "}
        {GAME_TYPE_SUMMARIES[competition.gameType]}
        {onlineNote(competition)}
      </p>
    );
  }
  const ruleset = competition.ruleset ?? DEFAULT_SEVENS_RULESET;
  return (
    <p className="mb-6 font-hud-body text-hud-sm text-hud-dim">
      Sevens · {SEVENS_RULESET_LABELS[ruleset]}
      {" · "}NAF clarifications apply. Swarming is enabled.
      {onlineNote(competition)}
    </p>
  );
}
