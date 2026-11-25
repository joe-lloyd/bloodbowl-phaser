import { useState } from "react";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  calculateTeamValue,
  type PendingDevelopment,
  type Team,
  isPendingRecruit,
} from "../../../types/Team";
import { saveTeam } from "../../../game/managers/TeamManager";
import { canAdvance, mustAdvance } from "../../../game/progression/progression";
import {
  chooseSecondarySkill,
  draftedPlayerPrice,
  keepDraftedPlayer,
  nominatePrimarySkill,
  releaseDraftedPlayer,
  rollPrimarySelection,
  rollSecondaryCandidates,
  type SkillSelectionResult,
  skillSelectionDecision,
  startPrimarySelection,
  startSecondarySelection,
} from "../../../game/progression/advancementModes";
import { SkillCategory, SkillType } from "../../../types/Skills";
import {
  canKeepRaisedDead,
  type RaisedDeadOffer,
  resolveRaisedDeadRecruit,
} from "../../../game/rules/raiseDead";
import {
  type JourneymanOffer,
  hireJourneyman,
  journeymanHireRefusal,
  journeymanPrice,
  releaseJourneyman,
} from "../../../game/rules/journeymen";
import {
  EXPENSIVE_MISTAKES_THRESHOLD,
  type ExpensiveMistakesEntry,
  describeExpensiveMistakes,
  resolveExpensiveMistakes,
  stepsBeforeExpensiveMistakes,
} from "../../../game/rules/expensiveMistakes";
import { CandidateOptions } from "../shared/CandidateOptions";
import {
  candidateThrows,
  type RollThrow,
  selectionThrows,
} from "../shared/rollThrows";
import { RollStage } from "../shared/RollTray";
import { useRollTray } from "../shared/useRollTray";
import { TeamSaveFieldset } from "../shared/TeamSaveFieldset";
import { SkillGrid, SkillText } from "../shared/SkillOption";
import { PlayerDevelopment } from "../hud/PlayerDevelopment";
import { isTeamSaving } from "../../hooks/teamSaveLock";
import { commitTeam } from "../hud/commitPlayerChange";
import {
  HudButton,
  Notice,
  Panel,
} from "../componentWarehouse/HudKit";

export function PendingDevelopmentPanel({
  team,
  onChange,
  showExpensiveMistakes = true,
  onOpenPlayer,
}: {
  team: Team;
  onChange: (team: Team) => void;

  showExpensiveMistakes?: boolean;
  onOpenPlayer?: ((playerId: string) => void) | undefined;
}) {
  const [notice, setNotice] = useState("");
  const dice = useRollTray(team);

  const pending = [
    ...(team.pendingDevelopment ?? []).filter(
      (entry) => entry.kind !== "expensive-mistakes"
    ),
    ...(team.pendingDevelopment ?? []).filter(
      (entry) => showExpensiveMistakes && entry.kind === "expensive-mistakes"
    ),
  ];
  if (pending.length === 0 && !team.players.some(mustAdvance) && !notice && !dice.rolling) {
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
      <RollStage dice={dice} />
      <TeamSaveFieldset>
      {pending.map((entry) => {
        switch (entry.kind) {
          case "raised-dead-recruit":
            return (
              <RaisedDeadEntry
                key={entry.id}
                team={team}
                entry={entry}
                onChange={onChange}
              />
            );
          case "advanced-league-advancement":
            if (isPendingRecruit(team, entry.playerId)) return null;
            return (
              <AdvancedLeagueEntry
                key={entry.id}
                team={team}
                entry={entry}
                onChange={onChange}
                onNotice={setNotice}
                onOpenPlayer={onOpenPlayer}
              />
            );
          case "sevens-skill-selection":
            return (
              <SkillSelectionEntry
                key={entry.id}
                team={team}
                entry={entry}
                rolling={dice.rolling}
                onRoll={dice.roll}
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
          case "journeyman-offer":
            return (
              <JourneymanEntry
                key={entry.id}
                team={team}
                entry={entry}
                onChange={onChange}
              />
            );
          case "expensive-mistakes":
            return (
              <ExpensiveMistakesStep
                key={entry.id}
                team={team}
                entry={entry}
                onChange={onChange}
                onNotice={setNotice}
              />
            );
        }
      })}
      </TeamSaveFieldset>
    </Panel>
  );
}

function RaisedDeadEntry({
  team,
  entry,
  onChange,
}: {
  team: Team;
  entry: RaisedDeadOffer;
  onChange: (team: Team) => void;
}) {
  const player = team.players.find(
    (candidate) => candidate.id === entry.playerId
  );
  if (!player) return null;
  const room = canKeepRaisedDead(team, player.id);
  const choose = (keep: boolean) => {
    resolveRaisedDeadRecruit(team, entry, keep);
    saveTeam(team);
    onChange({ ...team });
  };
  return (
    <div className={ENTRY}>
      <p className="mb-2">
        Masters of Undeath raised <strong>{player.playerName}</strong>. Hire
        them for free or let them go. Keeping them adds{" "}
        {(player.cost + player.teamValue).toLocaleString()} to team value.
      </p>
      {!room && (
        <p className="mb-2">
          Your roster is full. Resolve any other player offers to make room, or
          let this Lineman go.
        </p>
      )}
      <div className="flex gap-2">
        <HudButton
          size="sm"
          disabled={!room}
          onClick={() => {
            choose(true);
          }}
        >
          Hire for free
        </HudButton>
        <HudButton
          size="sm"
          variant="danger"
          onClick={() => {
            choose(false);
          }}
        >
          Let them go
        </HudButton>
      </div>
    </div>
  );
}

function JourneymanEntry({
  team,
  entry,
  onChange,
}: {
  team: Team;
  entry: JourneymanOffer;
  onChange: (team: Team) => void;
}) {
  const player = team.players.find(
    (candidate) => candidate.id === entry.playerId
  );
  if (!player) return null;
  const refusal = journeymanHireRefusal(team, entry);
  const price = journeymanPrice(player);
  const answer = (hire: boolean) => {
    if (hire) hireJourneyman(team, entry);
    else releaseJourneyman(team, entry);
    saveTeam(team);
    onChange({ ...team });
  };
  return (
    <div className={ENTRY} data-testid="journeyman-offer">
      <p className="mb-2">
        Journeyman <strong>{player.playerName}</strong> ({player.positionName},{" "}
        {player.spp} SPP) played for you. Hire them for good for{" "}
        {price.toLocaleString("en-GB")} gp from the Treasury: they lose Loner
        and keep their SPP. Otherwise they leave.
      </p>
      {refusal && <p className="mb-2 text-hud-warn">{refusal}</p>}
      <div className="flex gap-2">
        <HudButton
          size="sm"
          disabled={!!refusal}
          title={refusal}
          onClick={() => {
            answer(true);
          }}
        >
          Hire for {price.toLocaleString("en-GB")} gp
        </HudButton>
        <HudButton
          size="sm"
          variant="danger"
          onClick={() => {
            answer(false);
          }}
        >
          Let them go
        </HudButton>
      </div>
    </div>
  );
}

function ExpensiveMistakesStep({
  team,
  entry,
  onChange,
  onNotice,
}: {
  team: Team;
  entry: ExpensiveMistakesEntry;
  onChange: (team: Team) => void;
  onNotice: (notice: string) => void;
}) {
  const waiting = stepsBeforeExpensiveMistakes(team);
  const roll = () => {
    const result = resolveExpensiveMistakes(team, entry, panelRng());
    saveTeam(team);
    onNotice(`Expensive Mistakes: ${describeExpensiveMistakes(result)}`);
    onChange({ ...team });
  };
  return (
    <div className={ENTRY} data-testid="expensive-mistakes">
      <p className="mb-2">
        <strong className="text-hud-bone">Expensive Mistakes.</strong> The
        Treasury holds {team.treasury.toLocaleString("en-GB")} gp. With{" "}
        {EXPENSIVE_MISTAKES_THRESHOLD.toLocaleString("en-GB")} gp or more, a D6
        decides how much goes astray. Spend in the Team Builder first if you
        want to, then roll.
      </p>
      {waiting > 0 && (
        <p className="mb-2 text-hud-warn">
          Finish the choices above first: this is the last post-game step.
        </p>
      )}
      <HudButton size="sm" disabled={waiting > 0} onClick={roll}>
        Roll Expensive Mistakes
      </HudButton>
    </div>
  );
}

function revalueAndSave(team: Team): void {
  team.teamValue = calculateTeamValue(team);
  void saveTeam(team);
}

function selectionEntry(team: Team, entryId: string): SkillSelectionPending {
  const entry = team.pendingDevelopment?.find(({ id }) => id === entryId);
  if (entry?.kind !== "sevens-skill-selection")
    throw new Error("This Skill Selection has already been answered.");
  return entry;
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
  onNotice,
  onOpenPlayer,
}: {
  team: Team;
  entry: Extract<PendingDevelopment, { kind: "advanced-league-advancement" }>;
  onChange: (team: Team) => void;

  onNotice: (notice: string) => void;
  onOpenPlayer?: ((playerId: string) => void) | undefined;
}) {
  const player = team.players.find(
    (candidate) => candidate.id === entry.playerId
  );
  if (!player) {
    removePending(team, entry.id);
    return null;
  }

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
      ) : onOpenPlayer ? (
        <HudButton
          size="sm"
          onClick={() => {
            onOpenPlayer(player.id);
          }}
        >
          Advance player
        </HudButton>
      ) : (
        <PlayerDevelopment
          player={player}
          team={team}
          rngService={panelRng()}
          onSaved={() => {
            onChange({ ...team });
          }}
          onNotice={onNotice}
        />
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
    result.d3 === undefined ? "" : ` (D3 rolled ${String(result.d3)})`
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
  "mt-3 rounded-hud border border-white/10 bg-black/30 p-3 font-hud-body text-hud-sm text-hud-bone";
const SELECT = "hud-field w-auto max-w-full disabled:opacity-40";

function SkillSelectionEntry({
  team,
  entry,
  rolling,
  onRoll,
  onChange,
  onNotice,
}: {
  team: Team;
  entry: SkillSelectionPending;
  rolling: boolean;
  onRoll: (throws: RollThrow[], then?: () => void) => void;
  onChange: (team: Team) => void;
  onNotice: (notice: string) => void;
}) {
  const [playerId, setPlayerId] = useState("");
  const [category, setCategory] = useState<SkillCategory | "">("");
  const [skill, setSkill] = useState<SkillType | "">("");
  const [error, setError] = useState("");
  const rng = panelRng();

  const act = async (
    step: (
      draft: Team,
      draftEntry: SkillSelectionPending
    ) => (() => void) | undefined
  ) => {
    if (isTeamSaving()) return;
    try {
      const draft = structuredClone(team);
      const saved = step(draft, selectionEntry(draft, entry.id));
      draft.teamValue = calculateTeamValue(draft);
      await commitTeam(team, draft);
      saved?.();
      onChange({ ...team });
      setSkill("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const finish = (
    run: (
      draft: Team,
      draftEntry: SkillSelectionPending
    ) => SkillSelectionResult
  ) => {
    void act((draft, draftEntry) => {
      const result = run(draft, draftEntry);
      return () => {
        onRoll(selectionThrows(result), () => {
          onNotice(describeSelection(draft, result));
        });
      };
    });
  };

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
                onChange={(e) => {
                  setCategory(
                    option?.categories.find((c) => c === e.target.value) ?? ""
                  );
                }}
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
                  void act((draft, draftEntry) => {
                    startPrimarySelection(draft, draftEntry, playerId, category);
                    return undefined;
                  })
                }
              >
                Take a Primary skill
              </HudButton>
            </div>
            <HudButton
              size="sm"
              disabled={!decision.secondaryAvailable}
              onClick={() => {
                void act((draft, draftEntry) => {
                  startSecondarySelection(draft, draftEntry, rng);
                  return undefined;
                });
              }}
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
            <SkillGrid
              skills={decision.options}
              selected={skill}
              onSelect={setSkill}
            />
            <div className="mt-3">
              <HudButton
                size="sm"
                disabled={!skill}
                onClick={() =>
                  skill &&
                  void act((draft, draftEntry) => {
                    nominatePrimarySkill(draft, draftEntry, decision.chooser, skill);
                    return undefined;
                  })
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
              {playerName(team, decision.playerId)} learns one of these. A D3
              decides.
            </p>
            <ol className="mb-2 grid gap-2 sm:grid-cols-3">
              {decision.named.map((named, index) => (
                <li key={named}>
                  <strong>
                    {index + 1}. {named}
                  </strong>
                  <SkillText skill={named} />
                </li>
              ))}
            </ol>
            <HudButton
              size="sm"
              onClick={() => {
                finish((draft, draftEntry) =>
                  rollPrimarySelection(draft, draftEntry, rng)
                );
              }}
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
                  onClick={() => {
                    void act((draft, draftEntry) => {
                      const candidates = rollSecondaryCandidates(
                        draft,
                        draftEntry,
                        c,
                        rng
                      );
                      return () => {
                        onRoll(candidateThrows(candidates));
                      };
                    });
                  }}
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
            <CandidateOptions
              candidates={decision.candidates}
              onChoose={(chosen) => {
                finish((draft, draftEntry) =>
                  chooseSecondarySkill(draft, draftEntry, chosen, rng)
                );
              }}
            />
          </>
        );
    }
  })();

  if (rolling) return null;
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
      revalueAndSave(team);
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
          onClick={() => {
            act(() => {
              keepDraftedPlayer(team, entry);
            });
          }}
        >
          Pay {price.toLocaleString()} to keep
        </HudButton>
        <HudButton
          variant="danger"
          size="sm"
          onClick={() => {
            act(() => releaseDraftedPlayer(team, entry));
          }}
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
