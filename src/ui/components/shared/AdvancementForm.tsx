import { Player } from "../../../types/Player";
import {
  SkillCategory,
  SkillType,
  SKILL_DEFINITIONS,
} from "../../../types/Skills";
import {
  AdvancementChoice,
  characteristicChoices,
  nextAdvancementCosts,
  RandomSkillCandidate,
} from "../../../game/progression/progression";
import { cx, HudButton, hudChoiceClass } from "../componentWarehouse/HudKit";

const CHOICE_TEXT =
  "px-3 py-2 font-hud-label text-hud-sm font-bold uppercase tracking-[0.04em] text-hud-bone";

/**
 * Advanced League advancement UI: extracted from the old post-match results
 * screen so Manage Team's pending-development panel can present the same
 * SPP-spend flow (see team-advancement-modes: "Team development is
 * completed from Manage Team").
 */
export type SkillAccess = "primary" | "secondary";

export function AdvancementForm({
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
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            type="button"
            key={option.kind}
            disabled={player.spp < option.cost}
            onClick={() => setKind(option.kind)}
            className={cx(hudChoiceClass(kind === option.kind), CHOICE_TEXT)}
          >
            {option.label} ({option.cost} SPP)
          </button>
        ))}
      </div>

      {kind === "characteristic" ? (
        <div className="mt-4">
          <HudButton
            size="sm"
            onClick={rollCharacteristic}
            disabled={characteristicRoll !== null}
          >
            Roll D8
          </HudButton>
          {characteristicRoll !== null && (
            <>
              <p className="my-3 font-hud-label text-hud-lg font-bold uppercase text-hud-gold">
                Rolled {characteristicRoll}
              </p>
              <div className="flex flex-wrap gap-2">
                {characteristicChoices(player, characteristicRoll).map(
                  (stat) => (
                    <button
                      type="button"
                      key={stat}
                      onClick={() =>
                        applyChoice({
                          kind: "characteristic",
                          roll: characteristicRoll,
                          stat,
                        })
                      }
                      className={cx(hudChoiceClass(false), CHOICE_TEXT)}
                    >
                      Improve {stat}
                    </button>
                  )
                )}
              </div>
              <p className="mt-4 text-hud-dim">
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
              <HudButton
                size="sm"
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
              <HudButton
                size="sm"
                className="mt-3"
                disabled={!category || !!randomCandidates}
                onClick={rollRandom}
              >
                Roll two candidates
              </HudButton>
              {randomCandidates && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ...new Map(
                      randomCandidates.map((candidate) => [
                        candidate.skill,
                        candidate,
                      ])
                    ).values(),
                  ].map((candidate) => (
                    <button
                      type="button"
                      key={candidate.skill}
                      onClick={() =>
                        applyChoice({
                          kind: "random-primary",
                          skill: candidate.skill,
                        })
                      }
                      className={cx(hudChoiceClass(false), CHOICE_TEXT)}
                    >
                      {candidate.firstD6}, {candidate.secondD6}:{" "}
                      {candidate.skill}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <HudButton
              size="sm"
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
    </div>
  );
}

export function SkillSelectors({
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
    <div className="mt-3 flex flex-wrap gap-2">
      {!lockAccess && (
        <select
          value={access}
          onChange={(event) => setAccess(event.target.value as SkillAccess)}
          className="hud-field w-auto max-w-full"
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
        className="hud-field w-auto max-w-full"
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
        className="hud-field w-auto max-w-full disabled:opacity-40"
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
