import { useState } from "react";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { calculateTeamValue, PendingDevelopment, Team } from "../../../types/Team";
import { saveTeam } from "../../../game/managers/TeamManager";
import {
  AdvancementChoice,
  applyAdvancement,
  canAdvance,
  eligibleSkills,
  mustAdvance,
  RandomSkillCandidate,
  rollRandomPrimaryCandidates,
} from "../../../game/progression/progression";
import {
  confirmSkillSelectionAward,
  randomEligibleParticipant,
  resolveDraft,
  rollSkillSelectionCandidates,
  SkillSelectionCandidate,
} from "../../../game/progression/advancementModes";
import { SkillCategory, SkillType } from "../../../types/Skills";
import { AdvancementForm } from "../shared/AdvancementForm";

/**
 * Manage Team's pending-development resolution: Advanced League forced
 * advancements and Sevens Skill Selection awards (see team-advancement-modes
 * "Team development is completed from Manage Team"). Resolving a Skill
 * Selection entry also runs the post-game Draft, matching the design's
 * "durable post-match decisions" flow.
 */
export function PendingDevelopmentPanel({
  team,
  onChange,
}: {
  team: Team;
  onChange: (team: Team) => void;
}) {
  const pending = team.pendingDevelopment ?? [];
  if (pending.length === 0 && !team.players.some(mustAdvance)) return null;

  return (
    <section className="mt-4 rounded-lg border-2 border-bb-blood-red bg-bb-warm-paper p-4">
      <h3 className="font-heading text-xl text-bb-blood-red mb-2">
        Pending team development
      </h3>
      {pending.map((entry) =>
        entry.kind === "advanced-league-advancement" ? (
          <AdvancedLeagueEntry
            key={entry.id}
            team={team}
            entry={entry}
            onChange={onChange}
          />
        ) : (
          <SkillSelectionEntry
            key={entry.id}
            team={team}
            entry={entry}
            onChange={onChange}
          />
        )
      )}
    </section>
  );
}

function removePending(team: Team, entryId: string): void {
  team.pendingDevelopment = (team.pendingDevelopment ?? []).filter(
    (entry) => entry.id !== entryId
  );
}

function AdvancedLeagueEntry({
  team,
  entry,
  onChange,
}: {
  team: Team;
  entry: Extract<PendingDevelopment, { kind: "advanced-league-advancement" }>;
  onChange: (team: Team) => void;
}) {
  const [kind, setKind] = useState<AdvancementChoice["kind"]>("random-primary");
  const [access, setAccess] = useState<"primary" | "secondary">("primary");
  const [category, setCategory] = useState<SkillCategory | "">("");
  const [skill, setSkill] = useState<SkillType | "">("");
  const [randomCandidates, setRandomCandidates] = useState<
    [RandomSkillCandidate, RandomSkillCandidate] | null
  >(null);
  const [characteristicRoll, setCharacteristicRoll] = useState<number | null>(
    null
  );
  const [error, setError] = useState("");
  const rng = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().rngService
    : { rollDie: (sides: number) => 1 + Math.floor(Math.random() * sides) };

  const player = team.players.find((candidate) => candidate.id === entry.playerId);
  if (!player) {
    removePending(team, entry.id);
    return null;
  }

  const categories = access === "primary" ? (player.primary ?? []) : (player.secondary ?? []);
  const skills = category ? eligibleSkills(player, [category]) : [];

  const applyChoice = (choice: AdvancementChoice) => {
    try {
      applyAdvancement(player, choice);
      team.teamValue = calculateTeamValue(team);
      if (!mustAdvance(player)) removePending(team, entry.id);
      saveTeam(team);
      onChange({ ...team });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="mb-4 rounded border border-bb-dark-gold bg-white/60 p-3">
      <p className="font-body">
        <strong>{player.playerName}</strong> must buy an advancement (
        {player.spp} SPP) before the team's next required fixture.
      </p>
      {!canAdvance(player) ? (
        <p className="text-sm text-bb-deep-crimson mt-1">
          Not enough SPP yet — this resolves automatically once they qualify.
        </p>
      ) : (
        <AdvancementForm
          player={player}
          kind={kind}
          setKind={(next) => {
            setKind(next);
            setAccess(next === "chosen-secondary" ? "secondary" : "primary");
            setCategory("");
            setSkill("");
            setRandomCandidates(null);
            setCharacteristicRoll(null);
          }}
          access={access}
          setAccess={(next) => {
            setAccess(next);
            setCategory("");
            setSkill("");
          }}
          category={category}
          setCategory={(next) => {
            setCategory(next);
            setSkill("");
            setRandomCandidates(null);
          }}
          categories={categories}
          skill={skill}
          setSkill={setSkill}
          skills={skills}
          randomCandidates={randomCandidates}
          rollRandom={() => {
            if (!category) return;
            setRandomCandidates(rollRandomPrimaryCandidates(player, category, rng));
          }}
          characteristicRoll={characteristicRoll}
          rollCharacteristic={() => setCharacteristicRoll(rng.rollDie(8))}
          applyChoice={applyChoice}
        />
      )}
      {error && <p className="text-bb-deep-crimson text-sm mt-2">{error}</p>}
    </div>
  );
}

function SkillSelectionEntry({
  team,
  entry,
  onChange,
}: {
  team: Team;
  entry: Extract<PendingDevelopment, { kind: "sevens-skill-selection" }>;
  onChange: (team: Team) => void;
}) {
  const [method, setMethod] = useState<"primary" | "secondary">("primary");
  const [playerId, setPlayerId] = useState("");
  const [category, setCategory] = useState<SkillCategory | "">("");
  const [candidates, setCandidates] = useState<
    [SkillSelectionCandidate, SkillSelectionCandidate] | null
  >(null);
  const [draftResult, setDraftResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rng = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().rngService
    : { rollDie: (sides: number) => 1 + Math.floor(Math.random() * sides) };

  const eligible = entry.eligibleParticipantIds
    .map((id) => team.players.find((player) => player.id === id))
    .filter((player): player is NonNullable<typeof player> => !!player);

  const chosenPlayer =
    method === "primary"
      ? eligible.find((player) => player.id === playerId)
      : undefined;
  const categories =
    method === "primary" ? (chosenPlayer?.primary ?? []) : undefined;

  const rollForSecondary = () => {
    try {
      const recipientId = randomEligibleParticipant(
        entry.eligibleParticipantIds,
        rng
      );
      const recipient = team.players.find((p) => p.id === recipientId)!;
      const secondaryCategories = recipient.secondary ?? [];
      const chosenCategory = secondaryCategories[0];
      if (!chosenCategory) {
        setError(`${recipient.playerName} has no Secondary category access.`);
        return;
      }
      setPlayerId(recipientId);
      setCategory(chosenCategory);
      setCandidates(
        rollSkillSelectionCandidates(recipient, chosenCategory, "secondary", rng)
      );
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const rollForPrimary = () => {
    if (!chosenPlayer || !category) return;
    try {
      setCandidates(
        rollSkillSelectionCandidates(chosenPlayer, category, "primary", rng)
      );
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const confirm = (skill: SkillType) => {
    const recipient = team.players.find((p) => p.id === playerId);
    if (!recipient) return;
    try {
      confirmSkillSelectionAward(
        recipient,
        skill,
        method,
        entry.matchId,
        candidates ?? undefined
      );
      removePending(team, entry.id);
      team.teamValue = calculateTeamValue(team);
      const outcome = resolveDraft(team, rng, entry.matchId);
      if (outcome.records.length > 0) {
        setDraftResult(
          `The Draft: ${outcome.records
            .map((record) => `${record.playerName} (rolled ${record.roll})`)
            .join(", ")} left the team. +${outcome.goldCredited.toLocaleString()} gold.`
        );
      }
      saveTeam(team);
      onChange({ ...team });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (draftResult) {
    return (
      <div className="mb-4 rounded border border-bb-dark-gold bg-white/60 p-3">
        <p className="font-body">{draftResult}</p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded border border-bb-dark-gold bg-white/60 p-3">
      <p className="font-body mb-2">
        Choose this game's Skill Selection method.
      </p>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => {
            setMethod("primary");
            setCandidates(null);
            setPlayerId("");
            setCategory("");
          }}
          className={`rounded border px-3 py-2 text-sm ${method === "primary" ? "bg-bb-ink-blue text-white" : "bg-white"}`}
        >
          Coach picks Primary recipient
        </button>
        <button
          onClick={() => {
            setMethod("secondary");
            setCandidates(null);
            setPlayerId("");
            setCategory("");
          }}
          className={`rounded border px-3 py-2 text-sm ${method === "secondary" ? "bg-bb-ink-blue text-white" : "bg-white"}`}
        >
          Random recipient, Secondary
        </button>
      </div>

      {method === "primary" ? (
        <div className="flex flex-wrap gap-2 items-center">
          <select
            aria-label="Skill Selection recipient"
            value={playerId}
            onChange={(e) => {
              setPlayerId(e.target.value);
              setCategory("");
              setCandidates(null);
            }}
            className="rounded border border-bb-dark-gold p-2 text-sm"
          >
            <option value="">Choose eligible player</option>
            {eligible.map((player) => (
              <option key={player.id} value={player.id}>
                #{player.number} {player.playerName}
              </option>
            ))}
          </select>
          <select
            aria-label="Skill Selection category"
            value={category}
            disabled={!chosenPlayer}
            onChange={(e) => {
              setCategory(e.target.value as SkillCategory | "");
              setCandidates(null);
            }}
            className="rounded border border-bb-dark-gold p-2 text-sm disabled:opacity-40"
          >
            <option value="">Primary category</option>
            {categories?.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            disabled={!category || !!candidates}
            onClick={rollForPrimary}
            className="rounded bg-bb-ink-blue text-white px-3 py-2 text-sm disabled:opacity-40"
          >
            Roll two candidates
          </button>
        </div>
      ) : (
        <button
          disabled={!!candidates}
          onClick={rollForSecondary}
          className="rounded bg-bb-ink-blue text-white px-3 py-2 text-sm disabled:opacity-40"
        >
          Randomly select recipient and roll
        </button>
      )}

      {candidates && (
        <div className="mt-3 flex gap-3">
          {[...new Map(candidates.map((c) => [c.skill, c])).values()].map(
            (candidate) => (
              <button
                key={candidate.skill}
                onClick={() => confirm(candidate.skill)}
                className="rounded border border-bb-gold bg-bb-blood-red text-white px-4 py-2"
              >
                {candidate.firstD6}, {candidate.secondD6}: {candidate.skill}
              </button>
            )
          )}
        </div>
      )}
      {error && <p className="text-bb-deep-crimson text-sm mt-2">{error}</p>}
    </div>
  );
}
