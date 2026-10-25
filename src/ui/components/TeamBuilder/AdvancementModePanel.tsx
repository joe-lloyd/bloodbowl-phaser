import { useState } from "react";
import {
  setAdvancementMode,
  Team,
  TeamAdvancementMode,
  TeamRoster,
} from "../../../types/Team";
import {
  allocateMatchedPlaySkill,
  matchedPlaySkillStatus,
  removeMatchedPlayAllocation,
} from "../../../game/progression/advancementModes";
import {
  ELITE_SKILLS,
  eligibleSkills,
} from "../../../game/progression/progression";
import { SkillCategory, SkillType } from "../../../types/Skills";

export const MODE_LABELS: Record<TeamAdvancementMode, string> = {
  "matched-play": "Matched Play (tier Skill Points)",
  "advanced-league": "Advanced League (SPP)",
  "sevens-skill-selection": "Sevens Skill Selection (one skill per game)",
};

/** Compact labels for badges/pills (e.g. the Team Management overview card)
 *  where `MODE_LABELS`' parenthetical detail is too long. */
export const ADVANCEMENT_MODE_SHORT_LABELS: Record<TeamAdvancementMode, string> = {
  "matched-play": "Matched Play",
  "advanced-league": "Advanced League",
  "sevens-skill-selection": "Skill Selection",
};

interface Props {
  team: Team;
  roster: Pick<TeamRoster, "tier">;
  onChange: (team: Team) => void;
}

/**
 * Owns the advancement-mode choice (try/catch around `setAdvancementMode`
 * plus its error message) so `TeamBuilder.tsx` can render the mode-selector
 * button row directly under the Team Colours block, visually grouped with
 * it, while this file still owns the mode-specific package UI below.
 */
export function AdvancementModeSelector({
  team,
  onChange,
}: {
  team: Team;
  onChange: (team: Team) => void;
}) {
  const [error, setError] = useState("");
  const locked = !!team.advancementModeLocked;

  const chooseMode = (mode: TeamAdvancementMode) => {
    try {
      setAdvancementMode(team, mode);
      onChange({ ...team });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <>
      <ModeSelector
        mode={team.advancementMode}
        locked={locked}
        onChoose={chooseMode}
      />
      {error && <p className="mt-2 text-bb-deep-crimson text-sm">{error}</p>}
    </>
  );
}

export function AdvancementModePanel({ team, roster, onChange }: Props) {
  const [access, setAccess] = useState<"primary" | "secondary">("primary");
  const [playerId, setPlayerId] = useState("");
  const [category, setCategory] = useState<SkillCategory | "">("");
  const [skill, setSkill] = useState<SkillType | "">("");
  const [error, setError] = useState("");

  if (team.advancementMode !== "matched-play") {
    return null;
  }

  const status = matchedPlaySkillStatus(team, roster);
  const canBuySecondary = status.remaining >= 2 && status.secondaryCount === 0;
  const player = team.players.find((candidate) => candidate.id === playerId);
  const allocatedPlayerIds = new Set(
    (team.matchedPlayAllocations ?? []).map((allocation) => allocation.playerId)
  );
  const availablePlayers = team.players.filter(
    (candidate) => !allocatedPlayerIds.has(candidate.id)
  );
  const categories = player
    ? access === "primary"
      ? (player.primary ?? [])
      : (player.secondary ?? [])
    : [];
  const skills = (
    player && category ? eligibleSkills(player, [category]) : []
  ).filter((s) => status.eliteCount < 2 || !ELITE_SKILLS.has(s));

  const allocate = () => {
    if (!player || !skill) return;
    try {
      allocateMatchedPlaySkill(team, roster, player, skill, access);
      onChange({ ...team });
      setPlayerId("");
      setCategory("");
      setSkill("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const remove = (allocationPlayerId: string) => {
    const allocation = (team.matchedPlayAllocations ?? []).find(
      (candidate) => candidate.playerId === allocationPlayerId
    );
    const removePlayer = team.players.find(
      (candidate) => candidate.id === allocationPlayerId
    );
    if (!allocation || !removePlayer) return;
    removeMatchedPlayAllocation(team, removePlayer, allocation);
    onChange({ ...team });
  };

  return (
    <section className="mt-4 p-4 border-2 border-bb-dark-gold rounded-lg bg-bb-warm-paper">
      <h3 className="font-heading text-lg text-bb-ink-blue">
        Skill Points: {status.remaining} of {status.points} left
      </h3>
      <p className="text-xs text-bb-muted-text mb-2">
        A Primary skill costs 1 point and a Secondary skill 2. At most one
        Secondary skill and two Elite skills per team, and one skill per
        player. These skills do not raise team value.
      </p>

      <ul className="text-sm mb-3">
        {(team.matchedPlayAllocations ?? []).map((allocation) => {
          const owner = team.players.find((p) => p.id === allocation.playerId);
          return (
            <li
              key={allocation.playerId}
              className="flex justify-between items-center border-b border-bb-divider py-1"
            >
              <span>
                {owner?.playerName ?? allocation.playerId} — {allocation.skill}{" "}
                ({allocation.access})
              </span>
              <button
                className="text-bb-deep-crimson underline text-xs"
                onClick={() => remove(allocation.playerId)}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      {status.remaining > 0 && availablePlayers.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <select
            aria-label="Package recipient"
            value={playerId}
            onChange={(e) => {
              setPlayerId(e.target.value);
              setCategory("");
              setSkill("");
            }}
            className="rounded border border-bb-dark-gold p-2 text-sm"
          >
            <option value="">Choose player</option>
            {availablePlayers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                #{candidate.number} {candidate.playerName}
              </option>
            ))}
          </select>
          <select
            aria-label="Package access"
            value={access}
            onChange={(e) => {
              setAccess(e.target.value as "primary" | "secondary");
              setCategory("");
              setSkill("");
            }}
            className="rounded border border-bb-dark-gold p-2 text-sm"
          >
            <option value="primary">Primary (1 point)</option>
            {canBuySecondary && (
              <option value="secondary">Secondary (2 points)</option>
            )}
          </select>
          <select
            aria-label="Package category"
            value={category}
            disabled={!player}
            onChange={(e) => {
              setCategory(e.target.value as SkillCategory | "");
              setSkill("");
            }}
            className="rounded border border-bb-dark-gold p-2 text-sm disabled:opacity-40"
          >
            <option value="">Category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            aria-label="Package skill"
            value={skill}
            disabled={!category}
            onChange={(e) => setSkill(e.target.value as SkillType | "")}
            className="rounded border border-bb-dark-gold p-2 text-sm disabled:opacity-40"
          >
            <option value="">Skill</option>
            {skills.map((s) => (
              <option key={s} value={s}>
                {s}
                {ELITE_SKILLS.has(s) ? " (Elite)" : ""}
              </option>
            ))}
          </select>
          <button
            disabled={!skill}
            onClick={allocate}
            className="rounded bg-bb-ink-blue text-white px-3 py-2 text-sm disabled:opacity-40"
          >
            Allocate
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-bb-deep-crimson text-sm">{error}</p>}
    </section>
  );
}

export function ModeSelector({
  mode,
  locked,
  onChoose,
}: {
  mode: TeamAdvancementMode | undefined;
  locked: boolean;
  onChoose: (mode: TeamAdvancementMode) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[#1d3860] font-bold text-xs uppercase">
        Advancement Mode
      </label>
      <div className="flex gap-2 flex-wrap bg-white p-2 border-2 border-[#1d3860]">
        {(Object.keys(MODE_LABELS) as TeamAdvancementMode[]).map((key) => (
          <button
            key={key}
            type="button"
            disabled={locked}
            onClick={() => onChoose(key)}
            title={MODE_LABELS[key]}
            className={`px-3 py-2 rounded text-xs font-bold cursor-pointer transition-all hover:scale-105 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:opacity-60 ${
              mode === key
                ? "border-2 border-bb-gold shadow-md scale-105 bg-[#1d3860] text-white"
                : "border border-gray-400 bg-white text-[#1d3860]"
            }`}
          >
            {MODE_LABELS[key]}
          </button>
        ))}
      </div>
      {locked && (
        <span className="block text-xs text-bb-muted-text mt-1">
          Immutable — this team has been finalized or entered a competition.
        </span>
      )}
      {!mode && (
        <span className="block text-xs text-bb-deep-crimson mt-1">
          Choose a mode before saving this team.
        </span>
      )}
    </div>
  );
}
