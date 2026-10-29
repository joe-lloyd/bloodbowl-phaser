import { useState } from "react";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  calculateTeamValue,
  PendingDevelopment,
  Team,
} from "../../../types/Team";
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
  chooseSecondarySkill,
  draftedPlayerPrice,
  keepDraftedPlayer,
  nominatePrimarySkill,
  releaseDraftedPlayer,
  rollPrimarySelection,
  rollSecondaryCandidates,
  SkillSelectionResult,
  skillSelectionDecision,
  startPrimarySelection,
  startSecondarySelection,
} from "../../../game/progression/advancementModes";
import { SkillCategory, SkillType } from "../../../types/Skills";
import { AdvancementForm } from "../shared/AdvancementForm";
import {
  cx,
  HudButton,
  hudChoiceClass,
  Notice,
  Panel,
} from "../componentWarehouse/HudKit";

/**
 * Manage Team's pending-development resolution: Advanced League forced
 * advancements, Sevens Skill Selection awards, and Drafted Players offers
 * (see team-advancement-modes "Team development is completed from Manage
 * Team"). Finishing a Skill Selection rolls for Drafted Players, which may
 * add offers for the coach to answer.
 */
export function PendingDevelopmentPanel({
  team,
  onChange,
}: {
  team: Team;
  onChange: (team: Team) => void;
}) {
  const [notice, setNotice] = useState("");
  const pending = team.pendingDevelopment ?? [];
  if (pending.length === 0 && !team.players.some(mustAdvance) && !notice) {
    return null;
  }

  return (
    <Panel as="section" accent="blood" className="p-3">
      <h3 className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.06em] text-hud-warn">
        Pending team development
      </h3>
      {notice && (
        <Notice tone="info" role="status" className="mt-2">
          {notice}
        </Notice>
      )}
      {pending.map((entry) => {
        switch (entry.kind) {
          case "advanced-league-advancement":
            return (
              <AdvancedLeagueEntry
                key={entry.id}
                team={team}
                entry={entry}
                onChange={onChange}
              />
            );
          case "sevens-skill-selection":
            return (
              <SkillSelectionEntry
                key={entry.id}
                team={team}
                entry={entry}
                onChange={onChange}
                onNotice={setNotice}
              />
            );
          case "drafted-player-offer":
            return (
              <DraftOfferEntry
                key={entry.id}
                team={team}
                entry={entry}
                onChange={onChange}
              />
            );
        }
      })}
    </Panel>
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

  const player = team.players.find(
    (candidate) => candidate.id === entry.playerId
  );
  if (!player) {
    removePending(team, entry.id);
    return null;
  }

  const categories =
    access === "primary" ? (player.primary ?? []) : (player.secondary ?? []);
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
    <div className={ENTRY}>
      <p>
        <strong className="text-hud-bone">{player.playerName}</strong> must buy
        an advancement ({player.spp} SPP) before the team&apos;s next required
        fixture.
      </p>
      {!canAdvance(player) ? (
        <p className="mt-1 text-hud-warn">
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
            setRandomCandidates(
              rollRandomPrimaryCandidates(player, category, rng)
            );
          }}
          characteristicRoll={characteristicRoll}
          rollCharacteristic={() => setCharacteristicRoll(rng.rollDie(8))}
          applyChoice={applyChoice}
        />
      )}
      {error && (
        <Notice tone="bad" role="alert" className="mt-2">
          {error}
        </Notice>
      )}
    </div>
  );
}

type SkillSelectionPending = Extract<
  PendingDevelopment,
  { kind: "sevens-skill-selection" }
>;
type DraftOfferPending = Extract<
  PendingDevelopment,
  { kind: "drafted-player-offer" }
>;

function panelRng() {
  return ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().rngService
    : { rollDie: (sides: number) => 1 + Math.floor(Math.random() * sides) };
}

function playerName(team: Team, playerId: string): string {
  return team.players.find((p) => p.id === playerId)?.playerName ?? playerId;
}

function describeSelection(team: Team, result: SkillSelectionResult): string {
  const learned = `${playerName(team, result.playerId)} learned ${result.skill}${
    result.d3 === undefined ? "" : ` (D3 rolled ${result.d3})`
  }.`;
  const left = result.draft.released.map(
    (record) =>
      ` ${record.playerName} left for a pro team: the Treasury could not pay to keep them.`
  );
  const offers = result.draft.offers.map(
    (offer) =>
      ` A pro team made an offer for ${playerName(team, offer.playerId)}.`
  );
  return [learned, ...left, ...offers].join("");
}

const ENTRY =
  "mt-3 rounded-hud border border-white/10 bg-black/30 p-3 font-hud-body text-hud-sm text-[#ddd5c6]";
const SELECT = "hud-field w-auto max-w-full disabled:opacity-40";

/**
 * Sevens Skill Selection (Spike! Journal 22, A2-A3). Each step renders the
 * decision `skillSelectionDecision` reports. On the Primary route the
 * coaches name skills in turn; in hot-seat play both coaches use this
 * screen, so the prompt says whose turn it is.
 */
function SkillSelectionEntry({
  team,
  entry,
  onChange,
  onNotice,
}: {
  team: Team;
  entry: SkillSelectionPending;
  onChange: (team: Team) => void;
  onNotice: (notice: string) => void;
}) {
  const [playerId, setPlayerId] = useState("");
  const [category, setCategory] = useState<SkillCategory | "">("");
  const [skill, setSkill] = useState<SkillType | "">("");
  const [error, setError] = useState("");
  const rng = panelRng();

  const act = (step: () => void) => {
    try {
      step();
      team.teamValue = calculateTeamValue(team);
      saveTeam(team);
      onChange({ ...team });
      setSkill("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const finish = (run: () => SkillSelectionResult) =>
    act(() => onNotice(describeSelection(team, run())));

  const decision = skillSelectionDecision(team, entry);
  const body = (() => {
    switch (decision.type) {
      case "choose-route": {
        const option = decision.primaryOptions.find(
          (o) => o.playerId === playerId
        );
        return (
          <>
            <p className="mb-2">
              Choose this game&apos;s skill. Primary: you pick the player and a
              category, then both coaches name skills and a D3 decides.
              Secondary: a random player rolls a Secondary skill.
            </p>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select
                aria-label="Skill Selection recipient"
                value={playerId}
                onChange={(e) => {
                  setPlayerId(e.target.value);
                  setCategory("");
                }}
                className={SELECT}
              >
                <option value="">Choose a player</option>
                {decision.primaryOptions.map((o) => (
                  <option key={o.playerId} value={o.playerId}>
                    {playerName(team, o.playerId)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Skill Selection category"
                value={category}
                disabled={!option}
                onChange={(e) =>
                  setCategory(
                    option?.categories.find((c) => c === e.target.value) ?? ""
                  )
                }
                className={SELECT}
              >
                <option value="">Primary category</option>
                {option?.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <HudButton
                size="sm"
                disabled={!category}
                onClick={() =>
                  category &&
                  act(() =>
                    startPrimarySelection(team, entry, playerId, category)
                  )
                }
              >
                Take a Primary skill
              </HudButton>
            </div>
            <HudButton
              size="sm"
              disabled={!decision.secondaryAvailable}
              onClick={() =>
                act(() => startSecondarySelection(team, entry, rng))
              }
            >
              Random player, Secondary skill
            </HudButton>
          </>
        );
      }
      case "name-primary-skill":
        return (
          <>
            <p className="mb-2">
              <strong>
                {decision.chooser === "coach" ? "Coach" : "Opposing coach"}
              </strong>
              : name a {decision.category} skill for{" "}
              {playerName(team, decision.playerId)}.
              {decision.named.length > 0 &&
                ` Named so far: ${decision.named.join(", ")}.`}
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                aria-label="Named skill"
                value={skill}
                onChange={(e) =>
                  setSkill(
                    decision.options.find((s) => s === e.target.value) ?? ""
                  )
                }
                className={SELECT}
              >
                <option value="">Choose a skill</option>
                {decision.options.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <HudButton
                size="sm"
                disabled={!skill}
                onClick={() =>
                  skill &&
                  act(() =>
                    nominatePrimarySkill(team, entry, decision.chooser, skill)
                  )
                }
              >
                Name skill
              </HudButton>
            </div>
          </>
        );
      case "roll-primary-d3":
        return (
          <>
            <p className="mb-2">
              {playerName(team, decision.playerId)} learns one of:{" "}
              {decision.named.map((s, i) => `${i + 1}. ${s}`).join(", ")}.
            </p>
            <HudButton
              size="sm"
              onClick={() =>
                finish(() => rollPrimarySelection(team, entry, rng))
              }
            >
              Roll D3
            </HudButton>
          </>
        );
      case "choose-secondary-category":
        return (
          <>
            <p className="mb-2">
              {playerName(team, decision.playerId)} was picked at random. Choose
              a Secondary category to roll two skills from.
            </p>
            <div className="flex flex-wrap gap-2">
              {decision.categories.map((c) => (
                <HudButton
                  size="sm"
                  key={c}
                  onClick={() =>
                    act(() => rollSecondaryCandidates(team, entry, c, rng))
                  }
                >
                  {c}
                </HudButton>
              ))}
            </div>
          </>
        );
      case "choose-secondary-skill":
        return (
          <>
            <p className="mb-2">
              Choose the skill {playerName(team, decision.playerId)} learns.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                ...new Map(
                  decision.candidates.map((c) => [c.skill, c])
                ).values(),
              ].map((candidate) => (
                <button
                  type="button"
                  key={candidate.skill}
                  onClick={() =>
                    finish(() =>
                      chooseSecondarySkill(team, entry, candidate.skill, rng)
                    )
                  }
                  className={cx(
                    hudChoiceClass(false),
                    "px-3 py-2 font-hud-label text-hud-sm font-bold uppercase text-hud-bone"
                  )}
                >
                  {candidate.firstD6}, {candidate.secondD6}: {candidate.skill}
                </button>
              ))}
            </div>
          </>
        );
    }
  })();

  return (
    <div className={ENTRY}>
      {body}
      {error && (
        <Notice tone="bad" role="alert" className="mt-2">
          {error}
        </Notice>
      )}
    </div>
  );
}

/** A6: a pro team wants this player. Pay their value to keep them, or let
 *  them go. */
function DraftOfferEntry({
  team,
  entry,
  onChange,
}: {
  team: Team;
  entry: DraftOfferPending;
  onChange: (team: Team) => void;
}) {
  const [error, setError] = useState("");
  const player = team.players.find((p) => p.id === entry.playerId);
  if (!player) return null;
  const price = draftedPlayerPrice(player);

  const act = (step: () => void) => {
    try {
      step();
      team.teamValue = calculateTeamValue(team);
      saveTeam(team);
      onChange({ ...team });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className={ENTRY}>
      <p className="mb-2">
        A pro team made an offer for <strong>{player.playerName}</strong>{" "}
        (rolled {entry.roll} with {entry.addedSkillCount} added skills). Keeping
        them costs {price.toLocaleString()} from the Treasury (
        {team.treasury.toLocaleString()}) and raises their value by 15,000.
      </p>
      <div className="flex gap-2">
        <HudButton
          size="sm"
          disabled={price > team.treasury}
          onClick={() => act(() => keepDraftedPlayer(team, entry))}
        >
          Pay {price.toLocaleString()} to keep
        </HudButton>
        <HudButton
          variant="danger"
          size="sm"
          onClick={() => act(() => releaseDraftedPlayer(team, entry))}
        >
          Let them go
        </HudButton>
      </div>
      {error && (
        <Notice tone="bad" role="alert" className="mt-2">
          {error}
        </Notice>
      )}
    </div>
  );
}
