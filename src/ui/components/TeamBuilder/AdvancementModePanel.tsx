import { useState } from "react";
import {
  setAdvancementMode,
  Team,
  TeamAdvancementMode,
  TeamRoster,
} from "../../../types/Team";
import {
  allocateMatchedPlaySkill,
  createMatchedPlayPackage,
  matchedPlayPackageStatus,
  removeMatchedPlayAllocation,
} from "../../../game/progression/advancementModes";
import { eligibleSkills } from "../../../game/progression/progression";
import { SkillCategory, SkillType } from "../../../types/Skills";

const MODE_LABELS: Record<TeamAdvancementMode, string> = {
  "matched-play": "Matched Play (event skill package)",
  "advanced-league": "Advanced League (SPP)",
  "sevens-skill-selection": "Sevens Skill Selection (random skill + Draft)",
};

/** The practice/default package used when the team is not yet tied to a
 *  specific competition profile. Competitions may require a differently
 *  sized package — checkTeamCompatibility reports any shortfall against the
 *  competition's own numbers at entry time. */
const DEFAULT_PACKAGE = createMatchedPlayPackage();

interface Props {
  team: Team;
  roster: Pick<TeamRoster, "tier">;
  onChange: (team: Team) => void;
}

export function AdvancementModePanel({ team, roster, onChange }: Props) {
  const [access, setAccess] = useState<"primary" | "secondary">("primary");
  const [playerId, setPlayerId] = useState("");
  const [category, setCategory] = useState<SkillCategory | "">("");
  const [skill, setSkill] = useState<SkillType | "">("");
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

  if (team.advancementMode !== "matched-play") {
    return (
      <section className="mt-4 p-4 border-2 border-bb-dark-gold rounded-lg bg-bb-warm-paper">
        <ModeSelector
          mode={team.advancementMode}
          locked={locked}
          onChoose={chooseMode}
        />
        {error && <p className="mt-2 text-bb-deep-crimson text-sm">{error}</p>}
      </section>
    );
  }

  const status = matchedPlayPackageStatus(team, roster, DEFAULT_PACKAGE);
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
  const skills =
    player && category ? eligibleSkills(player, [category]) : [];

  const allocate = () => {
    if (!player || !skill) return;
    try {
      allocateMatchedPlaySkill(
        team,
        roster,
        DEFAULT_PACKAGE,
        player,
        skill,
        access
      );
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
      <ModeSelector
        mode={team.advancementMode}
        locked={locked}
        onChoose={chooseMode}
      />
      <h3 className="font-heading text-lg text-bb-ink-blue mt-4">
        Event skill package: {status.used}/{status.totalAllowance} allocated
        {status.complete ? " — complete" : ""}
      </h3>
      <p className="text-xs text-bb-muted-text mb-2">
        Up to {status.secondaryAllowance} of these may be a Secondary Skill; a
        Primary Skill may always be taken instead. One added skill per player.
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

      {status.used < status.totalAllowance && availablePlayers.length > 0 && (
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
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
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

function ModeSelector({
  mode,
  locked,
  onChoose,
}: {
  mode: TeamAdvancementMode | undefined;
  locked: boolean;
  onChoose: (mode: TeamAdvancementMode) => void;
}) {
  return (
    <label className="block font-heading text-lg text-bb-ink-blue">
      Advancement mode
      <select
        value={mode ?? ""}
        disabled={locked}
        onChange={(e) => onChoose(e.target.value as TeamAdvancementMode)}
        className="block mt-2 w-full bg-white border-2 border-bb-dark-gold rounded-lg px-4 py-3 font-body disabled:opacity-60"
      >
        {!mode && <option value="">Choose an advancement mode…</option>}
        {(Object.keys(MODE_LABELS) as TeamAdvancementMode[]).map((key) => (
          <option key={key} value={key}>
            {MODE_LABELS[key]}
          </option>
        ))}
      </select>
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
    </label>
  );
}
