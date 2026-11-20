import {
  DEFAULT_SEVENS_RULESET,
  SEVENS_RULESET_LABELS,
} from "../../../game/rules/sevensRuleset";
import {
  GAME_TYPE_LABELS,
  GAME_TYPE_SUMMARIES,
} from "../../../game/variants/gameTypes";
import { type CompetitionDoc } from "../../../competition/types";

export function CompetitionRulesLine({
  competition,
}: {
  competition: Pick<CompetitionDoc, "gameType" | "ruleset">;
}) {
  if (competition.gameType !== undefined && competition.gameType !== "sevens") {
    return (
      <p className="mb-6 font-hud-body text-hud-sm text-hud-dim">
        {GAME_TYPE_LABELS[competition.gameType]}
        {" · "}
        {GAME_TYPE_SUMMARIES[competition.gameType]}
      </p>
    );
  }
  const ruleset = competition.ruleset ?? DEFAULT_SEVENS_RULESET;
  return (
    <p className="mb-6 font-hud-body text-hud-sm text-hud-dim">
      Sevens · {SEVENS_RULESET_LABELS[ruleset]}
      {" · "}NAF clarifications apply. Swarming is enabled.
    </p>
  );
}
