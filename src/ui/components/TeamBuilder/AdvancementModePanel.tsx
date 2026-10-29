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
import {
  cx,
  HudButton,
  hudChoiceClass,
  Notice,
  Section,
} from "../componentWarehouse/HudKit";

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
      {error && (
        <Notice tone="bad" role="alert" className="mt-2">
          {error}
        </Notice>
      )}
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
    <Section
      title={`Skill Points: ${status.remaining} of ${status.points} left`}
      aside="Matched Play"
      accent="skill"
    >
      <p className="mb-3 text-hud-sm text-hud-dim">
        A Primary skill costs 1 point and a Secondary skill 2. At most one
        Secondary skill and two Elite skills per team, and one skill per
        player. These skills do not raise team value.
      </p>

      <ul className="mb-3 text-hud-sm">
        {(team.matchedPlayAllocations ?? []).map((allocation) => {
          const owner = team.players.find((p) => p.id === allocation.playerId);
          return (
            <li
              key={allocation.playerId}
              className="flex items-center justify-between border-b border-white/10 py-1.5"
            >
              <span>
                {owner?.playerName ?? allocation.playerId} — {allocation.skill}{" "}
                ({allocation.access})
              </span>
              <HudButton
                variant="danger"
                size="sm"
                onClick={() => remove(allocation.playerId)}
              >
                Remove
              </HudButton>
            </li>
          );
        })}
      </ul>

      {status.remaining > 0 && availablePlayers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 [&>select]:w-auto [&>select]:min-w-[150px]">
          <select
            aria-label="Package recipient"
            value={playerId}
            onChange={(e) => {
              setPlayerId(e.target.value);
              setCategory("");
              setSkill("");
            }}
            className="hud-field"
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
            className="hud-field"
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
            className="hud-field disabled:opacity-40"
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
            className="hud-field disabled:opacity-40"
          >
            <option value="">Skill</option>
            {skills.map((s) => (
              <option key={s} value={s}>
                {s}
                {ELITE_SKILLS.has(s) ? " (Elite)" : ""}
              </option>
            ))}
          </select>
          <HudButton
            variant="gold"
            size="sm"
            disabled={!skill}
            onClick={allocate}
          >
            Allocate
          </HudButton>
        </div>
      )}
      {error && (
        <Notice tone="bad" role="alert" className="mt-2">
          {error}
        </Notice>
      )}
    </Section>
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
    <div className="flex flex-col gap-1.5" role="group" aria-label="Advancement Mode">
      <span className="hud-label">Advancement Mode</span>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MODE_LABELS) as TeamAdvancementMode[]).map((key) => (
          <button
            key={key}
            type="button"
            disabled={locked}
            onClick={() => onChoose(key)}
            title={MODE_LABELS[key]}
            aria-pressed={mode === key}
            className={cx(
              hudChoiceClass(mode === key),
              "min-h-[36px] px-3 py-1.5 font-hud-label text-hud-sm font-bold uppercase tracking-[0.04em]",
              mode === key ? "text-hud-gold" : "text-hud-bone"
            )}
          >
            {MODE_LABELS[key]}
          </button>
        ))}
      </div>
      {locked && (
        <span className="block text-hud-sm text-hud-mute">
          Locked. This team has been finalized or entered a competition.
        </span>
      )}
      {!mode && (
        <span className="block text-hud-sm text-hud-warn">
          Choose a mode before saving this team.
        </span>
      )}
    </div>
  );
}
