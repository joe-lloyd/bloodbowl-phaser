import { useState } from "react";
import { Player } from "../../../types/Player";
import { SkillCategory, SkillType } from "../../../types/Skills";
import { Team, calculateTeamValue } from "../../../types/Team";
import { saveTeam } from "../../../game/managers/TeamManager";
import { RNGService } from "../../../services/rng/RNGService";
import {
  AdvancementChoice,
  applyAdvancement,
  canAdvance,
  characteristicChoices,
  eligibleSkills,
  mustAdvance,
  nextAdvancementCosts,
  RandomSkillCandidate,
  rollRandomPrimaryCandidates,
} from "../../../game/progression/progression";

type SkillAccess = "primary" | "secondary";

interface Props {
  team: Team;
  onTeamChanged: (team: Team) => void;
}

/**
 * Pending team development: skill/characteristic advancement moved here from
 * the match results screen (see match-results-screen / post-match-summary
 * specs) so a coach can leave results without choosing a skill immediately.
 * Eligibility is derived purely from each player's persisted SPP — no
 * separate "pending" flag is needed, since `canAdvance`/`mustAdvance` are
 * already pure functions of spp and advancement count.
 */
export function PlayerDevelopment({ team, onTeamChanged }: Props) {
  const [rng] = useState(() => new RNGService(Date.now()));
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [kind, setKind] = useState<AdvancementChoice["kind"]>("random-primary");
  const [access, setAccess] = useState<SkillAccess>("primary");
  const [category, setCategory] = useState<SkillCategory | "">("");
  const [skill, setSkill] = useState<SkillType | "">("");
  const [randomCandidates, setRandomCandidates] = useState<
    [RandomSkillCandidate, RandomSkillCandidate] | null
  >(null);
  const [characteristicRoll, setCharacteristicRoll] = useState<number | null>(
    null
  );
  const [error, setError] = useState("");

  const eligible = team.players.filter(canAdvance);
  if (eligible.length === 0) return null;

  const selectedPlayer = eligible.find(
    (player) => player.id === selectedPlayerId
  );

  const resetAdvancementForm = () => {
    setCategory("");
    setSkill("");
    setRandomCandidates(null);
    setCharacteristicRoll(null);
  };

  const applyChoice = (choice: AdvancementChoice) => {
    if (!selectedPlayer) return;
    try {
      applyAdvancement(selectedPlayer, choice);
      team.teamValue = calculateTeamValue(team);
      saveTeam(team);
      onTeamChanged({ ...team });
      resetAdvancementForm();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const categories =
    selectedPlayer == null
      ? []
      : access === "primary"
        ? (selectedPlayer.primary ?? [])
        : (selectedPlayer.secondary ?? []);
  const skills =
    selectedPlayer && category
      ? eligibleSkills(selectedPlayer, [category])
      : [];

  return (
    <section className="mt-8 rounded-lg border-2 border-bb-dark-gold bg-[#1d3860] p-6">
      <h2 className="font-heading text-2xl text-white">
        Pending Player Development
      </h2>
      <p className="mb-3 text-sm text-white/80">
        These players earned enough SPP in a recent match to advance. Nothing
        here is required before you play another match, except a player at
        their next Characteristic threshold, who must spend before advancing
        further.
      </p>
      <select
        value={selectedPlayerId}
        onChange={(event) => {
          setSelectedPlayerId(event.target.value);
          resetAdvancementForm();
        }}
        className="w-full rounded bg-white p-3 text-[#1d3860]"
      >
        <option value="">Choose an advanceable player</option>
        {eligible.map((player) => (
          <option key={player.id} value={player.id}>
            {player.playerName} — {player.spp} SPP
            {mustAdvance(player) ? " (must advance)" : ""}
          </option>
        ))}
      </select>

      {selectedPlayer && (
        <AdvancementForm
          player={selectedPlayer}
          kind={kind}
          setKind={(next) => {
            setKind(next);
            setAccess(next === "chosen-secondary" ? "secondary" : "primary");
            resetAdvancementForm();
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
            setRandomCandidates(
              rollRandomPrimaryCandidates(selectedPlayer, category, rng)
            );
          }}
          characteristicRoll={characteristicRoll}
          rollCharacteristic={() => setCharacteristicRoll(rng.rollDie(8))}
          applyChoice={applyChoice}
        />
      )}
      {error && <p className="mt-4 text-red-300">{error}</p>}
    </section>
  );
}

function AdvancementForm({
  player,
  kind,
  setKind,
  access,
  setAccess,
  category,
  setCategory,
  categories,
  skill,
  setSkill,
  skills,
  randomCandidates,
  rollRandom,
  characteristicRoll,
  rollCharacteristic,
  applyChoice,
}: {
  player: Player;
  kind: AdvancementChoice["kind"];
  setKind: (kind: AdvancementChoice["kind"]) => void;
  access: SkillAccess;
  setAccess: (access: SkillAccess) => void;
  category: SkillCategory | "";
  setCategory: (category: SkillCategory | "") => void;
  categories: SkillCategory[];
  skill: SkillType | "";
  setSkill: (skill: SkillType | "") => void;
  skills: SkillType[];
  randomCandidates: [RandomSkillCandidate, RandomSkillCandidate] | null;
  rollRandom: () => void;
  characteristicRoll: number | null;
  rollCharacteristic: () => void;
  applyChoice: (choice: AdvancementChoice) => void;
}) {
  const costs = nextAdvancementCosts(player)!;
  const options: {
    kind: AdvancementChoice["kind"];
    label: string;
    cost: number;
  }[] = [
    {
      kind: "random-primary",
      label: "Random Primary",
      cost: costs.randomPrimary,
    },
    {
      kind: "chosen-primary",
      label: "Choose Primary",
      cost: costs.chosenPrimary,
    },
    {
      kind: "chosen-secondary",
      label: "Choose Secondary",
      cost: costs.chosenSecondary,
    },
    {
      kind: "characteristic",
      label: "Characteristic",
      cost: costs.characteristic,
    },
  ];

  return (
    <div className="mt-4 rounded bg-white/10 p-4">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.kind}
            disabled={player.spp < option.cost}
            onClick={() => setKind(option.kind)}
            className={`rounded border px-3 py-2 text-white ${
              kind === option.kind
                ? "border-bb-gold bg-bb-blood-red"
                : "border-white/40"
            } disabled:opacity-40`}
          >
            {option.label} ({option.cost} SPP)
          </button>
        ))}
      </div>

      {kind === "characteristic" ? (
        <div className="mt-4">
          <button
            onClick={rollCharacteristic}
            disabled={characteristicRoll !== null}
            className="rounded bg-bb-ink-blue px-4 py-2 text-white"
          >
            Roll D8
          </button>
          {characteristicRoll !== null && (
            <>
              <p className="my-3 text-lg text-white">
                Rolled {characteristicRoll}
              </p>
              <div className="flex flex-wrap gap-2">
                {characteristicChoices(player, characteristicRoll).map(
                  (stat) => (
                    <button
                      key={stat}
                      onClick={() =>
                        applyChoice({
                          kind: "characteristic",
                          roll: characteristicRoll,
                          stat,
                        })
                      }
                      className="rounded border border-bb-gold bg-bb-blood-red px-4 py-2 text-white"
                    >
                      Improve {stat}
                    </button>
                  )
                )}
              </div>
              <p className="mt-4 text-white">
                Or take a chosen skill at the spent Characteristic cost:
              </p>
              <SkillSelectors
                access={access}
                setAccess={setAccess}
                category={category}
                setCategory={setCategory}
                categories={
                  access === "primary"
                    ? (player.primary ?? [])
                    : (player.secondary ?? [])
                }
                skill={skill}
                setSkill={setSkill}
                skills={skills}
              />
              <button
                disabled={!skill}
                onClick={() =>
                  skill &&
                  applyChoice({
                    kind: "characteristic-fallback",
                    roll: characteristicRoll,
                    skill,
                    access,
                  })
                }
                className="mt-3 rounded bg-bb-ink-blue px-4 py-2 text-white disabled:opacity-40"
              >
                Confirm skill fallback
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <SkillSelectors
            access={access}
            setAccess={setAccess}
            lockAccess
            category={category}
            setCategory={setCategory}
            categories={categories}
            skill={skill}
            setSkill={setSkill}
            skills={skills}
          />
          {kind === "random-primary" ? (
            <>
              <button
                disabled={!category || !!randomCandidates}
                onClick={rollRandom}
                className="mt-3 rounded bg-bb-ink-blue px-4 py-2 text-white disabled:opacity-40"
              >
                Roll two candidates
              </button>
              {randomCandidates && (
                <div className="mt-3 flex gap-3">
                  {[
                    ...new Map(
                      randomCandidates.map((candidate) => [
                        candidate.skill,
                        candidate,
                      ])
                    ).values(),
                  ].map((candidate) => (
                    <button
                      key={candidate.skill}
                      onClick={() =>
                        applyChoice({
                          kind: "random-primary",
                          skill: candidate.skill,
                        })
                      }
                      className="rounded border border-bb-gold bg-bb-blood-red px-4 py-2 text-white"
                    >
                      {candidate.firstD6}, {candidate.secondD6}:{" "}
                      {candidate.skill}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <button
              disabled={!skill}
              onClick={() =>
                skill &&
                applyChoice({
                  kind,
                  skill,
                } as AdvancementChoice)
              }
              className="mt-3 rounded bg-bb-ink-blue px-4 py-2 text-white disabled:opacity-40"
            >
              Confirm skill
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SkillSelectors({
  access,
  setAccess,
  lockAccess = false,
  category,
  setCategory,
  categories,
  skill,
  setSkill,
  skills,
}: {
  access: SkillAccess;
  setAccess: (access: SkillAccess) => void;
  lockAccess?: boolean;
  category: SkillCategory | "";
  setCategory: (category: SkillCategory | "") => void;
  categories: SkillCategory[];
  skill: SkillType | "";
  setSkill: (skill: SkillType | "") => void;
  skills: SkillType[];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {!lockAccess && (
        <select
          value={access}
          onChange={(event) => setAccess(event.target.value as SkillAccess)}
          className="rounded bg-white p-2 text-[#1d3860]"
        >
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
        </select>
      )}
      <select
        value={category}
        onChange={(event) =>
          setCategory(event.target.value as SkillCategory | "")
        }
        className="rounded bg-white p-2 text-[#1d3860]"
      >
        <option value="">Choose category</option>
        {categories.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <select
        value={skill}
        disabled={!category}
        onChange={(event) => setSkill(event.target.value as SkillType | "")}
        className="rounded bg-white p-2 text-[#1d3860] disabled:opacity-40"
      >
        <option value="">Choose skill</option>
        {skills.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}
