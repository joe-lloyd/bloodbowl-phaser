import {
  DEFAULT_SEVENS_RULESET,
  SEVENS_RULESET_LABELS,
} from "../../../game/rules/sevensRuleset";
import {
  GAME_TYPE_LABELS,
  GAME_TYPE_SUMMARIES,
} from "../../../game/variants/gameTypes";
import { type CompetitionDoc } from "../../../competition/types";

type RulesLineCompetition = Pick<
  CompetitionDoc,
  "gameType" | "ruleset" | "online"
>;

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
