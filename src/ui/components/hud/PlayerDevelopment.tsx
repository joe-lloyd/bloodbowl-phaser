import { useState } from "react";
import { Player } from "../../../types/Player";
import { SkillCategory, SkillType, SKILL_DEFINITIONS } from "../../../types/Skills";
import { calculateTeamValue, Team } from "../../../types/Team";
import { saveTeam } from "../../../game/managers/TeamManager";
import { IRNGService } from "../../../services/rng/RNGService";
import {
  cx,
  HudButton,
  hudChoiceClass,
  Notice,
} from "../componentWarehouse/HudKit";
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
      <p className="text-hud-mute">
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
            className={cx(
              hudChoiceClass(kind === option.kind),
              "px-3 py-2 font-hud-label text-hud-base font-bold uppercase tracking-[0.04em] text-hud-bone"
            )}
          >
            {option.label} ({option.cost} SPP)
          </button>
        ))}
      </div>

      {kind === "characteristic" ? (
        <div className="mt-4">
          <HudButton
            variant="gold"
            onClick={() => setCharacteristicRoll(rngService.rollDie(8))}
            disabled={characteristicRoll !== null}
          >
            Roll D8
          </HudButton>
          {characteristicRoll !== null && (
            <>
              <p className="my-3 font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em] text-hud-bone">
                Rolled {characteristicRoll}
              </p>
              <div className="flex flex-wrap gap-2">
                {characteristicChoices(player, characteristicRoll).map(
                  (stat) => (
                    <HudButton
                      key={stat}
                      variant="secondary"
                      onClick={() =>
                        applyChoice({
                          kind: "characteristic",
                          roll: characteristicRoll,
                          stat,
                        })
                      }
                    >
                      Improve {stat}
                    </HudButton>
                  )
                )}
              </div>
              <p className="mt-4 text-hud-dim">
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
              <HudButton
                variant="primary"
                className="mt-3"
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
              >
                Confirm skill fallback
              </HudButton>
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
              <HudButton
                variant="gold"
                className="mt-3"
                disabled={!category || !!randomCandidates}
                onClick={() => {
                  if (!category) return;
                  setRandomCandidates(
                    rollRandomPrimaryCandidates(player, category, rngService)
                  );
                }}
              >
                Roll two candidates
              </HudButton>
              {randomCandidates && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {[
                    ...new Map(
                      randomCandidates.map((candidate) => [
                        candidate.skill,
                        candidate,
                      ])
                    ).values(),
                  ].map((candidate) => (
                    <HudButton
                      key={candidate.skill}
                      variant="secondary"
                      onClick={() =>
                        applyChoice({
                          kind: "random-primary",
                          skill: candidate.skill,
                        })
                      }
                    >
                      {candidate.firstD6}, {candidate.secondD6}:{" "}
                      {candidate.skill}
                    </HudButton>
                  ))}
                </div>
              )}
            </>
          ) : (
            <HudButton
              variant="primary"
              className="mt-3"
              disabled={!skill}
              onClick={() =>
                skill &&
                applyChoice({
                  kind,
                  skill,
                } as AdvancementChoice)
              }
            >
              Confirm skill
            </HudButton>
          )}
        </div>
      )}
      {error && (
        <Notice tone="bad" role="alert" className="mt-3">
          {error}
        </Notice>
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
    <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
      {!lockAccess && (
        <select
          value={access}
          onChange={(event) => setAccess(event.target.value as SkillAccess)}
          className="hud-field"
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
        className="hud-field"
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
        className="hud-field disabled:opacity-40"
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
