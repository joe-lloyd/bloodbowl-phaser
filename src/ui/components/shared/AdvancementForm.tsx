import { PendingAdvancementRoll, Player } from "../../../types/Player";
import { SkillCategory, SkillType } from "../../../types/Skills";
import {
  AdvancementChoice,
  characteristicChoices,
  nextAdvancementCosts,
} from "../../../game/progression/progression";
import {
  cx,
  HudButton,
  hudChoiceClass,
  Notice,
} from "../componentWarehouse/HudKit";

const CHOICE_TEXT =
  "px-3 py-2 font-hud-label text-hud-sm font-bold uppercase tracking-[0.04em] text-hud-bone";

export type SkillAccess = "primary" | "secondary";
type AdvancementKind = AdvancementChoice["kind"];

const OPTION_HELP: Record<
  Exclude<AdvancementKind, "characteristic-fallback">,
  string
> = {
  "random-primary":
    "Pick a Primary category, roll two skills from it and keep one.",
  "chosen-primary": "Pick any legal skill from a Primary category.",
  "chosen-secondary": "Pick any legal skill from a Secondary category.",
  characteristic:
    "Roll a D8 to see which characteristics can improve, or take a chosen skill instead.",
};

/**
 * The SPP advancement view (state and saving live in PlayerDevelopment).
 * Only advancements the player can afford can be picked, nothing else is
 * shown until one is, and a saved roll locks the form to that roll.
 */
export function AdvancementForm({
  player,
  savedRoll,
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
  rollRandom,
  rollCharacteristic,
  applyChoice,
}: {
  player: Player;
  savedRoll: PendingAdvancementRoll | undefined;
  kind: AdvancementKind | null;
  setKind: (kind: AdvancementKind) => void;
  access: SkillAccess;
  setAccess: (access: SkillAccess) => void;
  category: SkillCategory | "";
  setCategory: (category: SkillCategory | "") => void;
  categories: SkillCategory[];
  skill: SkillType | "";
  setSkill: (skill: SkillType | "") => void;
  skills: SkillType[];
  rollRandom: () => void;
  rollCharacteristic: () => void;
  applyChoice: (choice: AdvancementChoice) => void;
}) {
  const costs = nextAdvancementCosts(player)!;
  const spp = player.spp ?? 0;
  const options: {
    kind: Exclude<AdvancementKind, "characteristic-fallback">;
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
    <div className="mt-2" data-testid="advancement-form">
      <p className="text-hud-base text-hud-bone">
        <strong>{spp} SPP</strong> to spend.{" "}
        {savedRoll
          ? "Finish the saved roll below."
          : "Pick an advancement you can afford:"}
      </p>
      <div
        className="mt-2 flex flex-wrap gap-2"
        role="group"
        aria-label="Advancement type"
      >
        {options.map((option) => {
          const short = option.cost - spp;
          const lockedByRoll = !!savedRoll && savedRoll.kind !== option.kind;
          return (
            <button
              type="button"
              key={option.kind}
              data-testid={`advancement-${option.kind}`}
              disabled={short > 0 || lockedByRoll}
              aria-pressed={kind === option.kind}
              title={
                short > 0
                  ? `Needs ${short} more SPP`
                  : lockedByRoll
                    ? "Finish the saved roll first"
                    : OPTION_HELP[option.kind]
              }
              onClick={() => setKind(option.kind)}
              className={cx(hudChoiceClass(kind === option.kind), CHOICE_TEXT)}
            >
              <span className="block">{option.label}</span>
              <span className="block font-hud-body font-normal normal-case tracking-normal text-hud-dim">
                {option.cost} SPP
                {short > 0 ? ` · needs ${short} more` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {savedRoll && (
        <Notice tone="info" role="status" className="mt-3">
          This roll is saved. Take one of its results to finish the advancement;
          it cannot be rolled again.
        </Notice>
      )}

      {kind === null ? (
        <p className="mt-3 text-hud-dim">
          Choose an advancement above to see its options.
        </p>
      ) : kind === "characteristic" ? (
        <CharacteristicStep
          player={player}
          roll={savedRoll?.kind === "characteristic" ? savedRoll.roll : null}
          rollCharacteristic={rollCharacteristic}
          access={access}
          setAccess={setAccess}
          category={category}
          setCategory={setCategory}
          skill={skill}
          setSkill={setSkill}
          skills={skills}
          applyChoice={applyChoice}
        />
      ) : (
        <div className="mt-3">
          <p className="text-hud-dim">
            {OPTION_HELP[kind as keyof typeof OPTION_HELP]}
          </p>
          <SkillSelectors
            access={access}
            setAccess={setAccess}
            lockAccess
            category={category}
            setCategory={setCategory}
            categories={categories}
            categoryLocked={savedRoll?.kind === "random-primary"}
            showSkill={kind !== "random-primary"}
            skill={skill}
            setSkill={setSkill}
            skills={skills}
          />
          {kind === "random-primary" ? (
            savedRoll?.kind === "random-primary" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ...new Map(
                    savedRoll.candidates.map((candidate) => [
                      candidate.skill,
                      candidate,
                    ])
                  ).values(),
                ].map((candidate) => (
                  <button
                    type="button"
                    key={candidate.skill}
                    data-testid="random-candidate"
                    onClick={() =>
                      applyChoice({
                        kind: "random-primary",
                        skill: candidate.skill,
                      })
                    }
                    className={cx(hudChoiceClass(false), CHOICE_TEXT)}
                  >
                    {candidate.firstD6}, {candidate.secondD6}: {candidate.skill}
                  </button>
                ))}
              </div>
            ) : (
              <HudButton
                size="sm"
                className="mt-3"
                disabled={!category}
                onClick={rollRandom}
              >
                Roll two candidates
              </HudButton>
            )
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

function CharacteristicStep({
  player,
  roll,
  rollCharacteristic,
  access,
  setAccess,
  category,
  setCategory,
  skill,
  setSkill,
  skills,
  applyChoice,
}: {
  player: Player;
  roll: number | null;
  rollCharacteristic: () => void;
  access: SkillAccess;
  setAccess: (access: SkillAccess) => void;
  category: SkillCategory | "";
  setCategory: (category: SkillCategory | "") => void;
  skill: SkillType | "";
  setSkill: (skill: SkillType | "") => void;
  skills: SkillType[];
  applyChoice: (choice: AdvancementChoice) => void;
}) {
  if (roll === null) {
    return (
      <div className="mt-3">
        <p className="text-hud-dim">{OPTION_HELP.characteristic}</p>
        <HudButton size="sm" className="mt-3" onClick={rollCharacteristic}>
          Roll D8
        </HudButton>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <p className="my-3 font-hud-label text-hud-lg font-bold uppercase text-hud-gold">
        Rolled {roll}
      </p>
      <div className="flex flex-wrap gap-2">
        {characteristicChoices(player, roll).map((stat) => (
          <button
            type="button"
            key={stat}
            onClick={() => applyChoice({ kind: "characteristic", roll, stat })}
            className={cx(hudChoiceClass(false), CHOICE_TEXT)}
          >
            Improve {stat}
          </button>
        ))}
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
            roll,
            skill,
            access,
          })
        }
      >
        Confirm skill fallback
      </HudButton>
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
  categoryLocked = false,
  showSkill = true,
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
  categoryLocked?: boolean;
  showSkill?: boolean;
  skill: SkillType | "";
  setSkill: (skill: SkillType | "") => void;
  skills: SkillType[];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {!lockAccess && (
        <select
          aria-label="Skill access"
          value={access}
          onChange={(event) => setAccess(event.target.value as SkillAccess)}
          className="hud-field w-auto max-w-full"
        >
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
        </select>
      )}
      <select
        aria-label="Skill category"
        value={category}
        disabled={categoryLocked}
        onChange={(event) =>
          setCategory(event.target.value as SkillCategory | "")
        }
        className="hud-field w-auto max-w-full disabled:opacity-60"
      >
        <option value="">Choose category</option>
        {(categoryLocked && category && !categories.includes(category)
          ? [category, ...categories]
          : categories
        ).map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      {showSkill && (
        <select
          aria-label="Skill"
          value={skill}
          disabled={!category}
          onChange={(event) => setSkill(event.target.value as SkillType | "")}
          className="hud-field w-auto max-w-full disabled:opacity-40"
        >
          <option value="">Choose skill</option>
          {skills.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
