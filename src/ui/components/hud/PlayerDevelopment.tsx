import { useState } from "react";
import { Player } from "../../../types/Player";
import { SkillCategory, SkillType, SKILL_DEFINITIONS } from "../../../types/Skills";
import { calculateTeamValue, Team } from "../../../types/Team";
import { saveTeam } from "../../../game/managers/TeamManager";
import { IRNGService } from "../../../services/rng/RNGService";
import {
  AdvancementChoice,
  applyAdvancement,
  characteristicChoices,
  eligibleSkills,
  nextAdvancementCosts,
  RandomSkillCandidate,
  rollRandomPrimaryCandidates,
} from "../../../game/progression/progression";

type SkillAccess = "primary" | "secondary";

interface PlayerDevelopmentProps {
  player: Player;
  team: Team;
  rngService: Pick<IRNGService, "rollDie">;
  /** Called after an advancement is applied and the team is saved. */
  onApplied?: () => void;
}

/**
 * Standard SPP advancement controls — the reusable component behind Manage
 * Team's player development page. It is the only place in the app that
 * actually spends SPP and applies a skill or characteristic advancement;
 * the post-match results screen only shows who has pending development,
 * it never renders this component.
 */
export function PlayerDevelopment({
  player,
  team,
  rngService,
  onApplied,
}: PlayerDevelopmentProps) {
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

  const costs = nextAdvancementCosts(player);
  if (!costs) {
    return (
      <p className="font-body italic text-bb-muted-text">
        This player is a Legend and cannot advance further.
      </p>
    );
  }

  const resetForm = () => {
    setCategory("");
    setSkill("");
    setRandomCandidates(null);
    setCharacteristicRoll(null);
  };

  const applyChoice = (choice: AdvancementChoice) => {
    try {
      applyAdvancement(player, choice);
      team.teamValue = calculateTeamValue(team);
      saveTeam(team);
      resetForm();
      setError("");
      onApplied?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const categories =
    access === "primary" ? (player.primary ?? []) : (player.secondary ?? []);
  const skills = category ? eligibleSkills(player, [category]) : [];

  const options: {
    kind: AdvancementChoice["kind"];
    label: string;
    cost: number;
  }[] = [
    { kind: "random-primary", label: "Random Primary", cost: costs.randomPrimary },
    { kind: "chosen-primary", label: "Choose Primary", cost: costs.chosenPrimary },
    {
      kind: "chosen-secondary",
      label: "Choose Secondary",
      cost: costs.chosenSecondary,
    },
    { kind: "characteristic", label: "Characteristic", cost: costs.characteristic },
  ];

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.kind}
            disabled={player.spp < option.cost}
            onClick={() => {
              setKind(option.kind);
              setAccess(
                option.kind === "chosen-secondary" ? "secondary" : "primary"
              );
              resetForm();
            }}
            className={`rounded border px-3 py-2 ${
              kind === option.kind
                ? "border-bb-gold bg-bb-blood-red"
                : "border-slate-600"
            } disabled:opacity-40`}
          >
            {option.label} ({option.cost} SPP)
          </button>
        ))}
      </div>

      {kind === "characteristic" ? (
        <div className="mt-4">
          <button
            onClick={() => setCharacteristicRoll(rngService.rollDie(8))}
            disabled={characteristicRoll !== null}
            className="rounded bg-bb-ink-blue px-4 py-2"
          >
            Roll D8
          </button>
          {characteristicRoll !== null && (
            <>
              <p className="my-3 text-lg">Rolled {characteristicRoll}</p>
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
                      className="rounded border border-bb-gold bg-bb-blood-red px-4 py-2"
                    >
                      Improve {stat}
                    </button>
                  )
                )}
              </div>
              <p className="mt-4">
                Or take a chosen skill at the spent Characteristic cost:
              </p>
              <SkillSelectors
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
                }}
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
                className="mt-3 rounded bg-bb-ink-blue px-4 py-2 disabled:opacity-40"
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
            setAccess={(next) => {
              setAccess(next);
              setCategory("");
              setSkill("");
            }}
            lockAccess
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
          />
          {kind === "random-primary" ? (
            <>
              <button
                disabled={!category || !!randomCandidates}
                onClick={() => {
                  if (!category) return;
                  setRandomCandidates(
                    rollRandomPrimaryCandidates(player, category, rngService)
                  );
                }}
                className="mt-3 rounded bg-bb-ink-blue px-4 py-2 disabled:opacity-40"
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
                      className="rounded border border-bb-gold bg-bb-blood-red px-4 py-2"
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
              className="mt-3 rounded bg-bb-ink-blue px-4 py-2 disabled:opacity-40"
            >
              Confirm skill
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-red-400">{error}</p>}
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
          className="rounded bg-slate-950 p-2"
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
        className="rounded bg-slate-950 p-2"
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
        className="rounded bg-slate-950 p-2 disabled:opacity-40"
      >
        <option value="">Choose skill</option>
        {skills.map((item) => (
          <option key={item} value={item}>
            {item}
            {SKILL_DEFINITIONS[item].category ? "" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
