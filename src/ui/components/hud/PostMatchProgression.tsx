import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { Player } from "../../../types/Player";
import {
  SkillCategory,
  SkillType,
  SKILL_DEFINITIONS,
} from "../../../types/Skills";
import { calculateTeamValue, Team } from "../../../types/Team";
import { saveTeam } from "../../../game/managers/TeamManager";
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
import { MatchStatsSummary } from "../../../game/progression/MatchStats";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { GameEventNames } from "../../../types/events";

interface Props {
  visible: boolean;
}

type SkillAccess = "primary" | "secondary";

function ownedTeams(teams: Team[]): Team[] {
  const online = getActiveOnlineMatch();
  return online ? teams.filter((team) => team.id === online.myTeamId) : teams;
}

export function PostMatchProgression({ visible }: Props) {
  const navigate = useNavigate();
  const container = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance()
    : null;
  const tracker = container?.matchStats;
  const teamIds = useMemo(
    () =>
      tracker
        ? [...new Set(tracker.summary().players.map((player) => player.teamId))]
        : [],
    [tracker, visible]
  );
  const teams = teamIds
    .map((id) => container?.gameService.getTeam(id))
    .filter((team): team is Team => !!team);

  const [nominations, setNominations] = useState<Record<string, string[]>>({});
  const [mvpResults, setMvpResults] = useState<
    Record<string, { playerId: string; roll: number }>
  >({});
  const [summary, setSummary] = useState<MatchStatsSummary | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [touchdownRecipients, setTouchdownRecipients] = useState<
    Record<string, string>
  >({});
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
  const [, refresh] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!container) return;
    const onMvp = (result: {
      teamId: string;
      playerId: string;
      roll: number;
    }) => {
      setMvpResults((previous) => ({
        ...previous,
        [result.teamId]: result,
      }));
      refresh((value) => value + 1);
    };
    const onTouchdown = () => refresh((value) => value + 1);
    container.eventBus.on(GameEventNames.MvpAwarded, onMvp);
    container.eventBus.on(GameEventNames.AwardedTouchdownAssigned, onTouchdown);
    return () => {
      container.eventBus.off(GameEventNames.MvpAwarded, onMvp);
      container.eventBus.off(
        GameEventNames.AwardedTouchdownAssigned,
        onTouchdown
      );
    };
  }, [container]);

  if (!visible || !container || !tracker?.progressionEnabled) return null;

  const allPlayers = teams.flatMap((team) => team.players);
  const statsSummary = summary ?? tracker.summary(allPlayers);
  const own = ownedTeams(teams);
  const ownPlayers = own.flatMap((team) => team.players);
  const selectedPlayer = ownPlayers.find(
    (player) => player.id === selectedPlayerId
  );
  const pendingMvpTeams = teams.filter(
    (team) =>
      !statsSummary.players.some(
        (stats) => stats.teamId === team.id && stats.mvps > 0
      )
  );

  const nomineesFor = (team: Team): string[] => {
    const existing = nominations[team.id];
    if (existing) return existing;
    return tracker.getEligibleMvpPlayers(team.id).slice(0, 6);
  };

  const toggleNominee = (team: Team, playerId: string) => {
    const current = nomineesFor(team);
    const next = current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : current.length < 6
        ? [...current, playerId]
        : current;
    setNominations((previous) => ({ ...previous, [team.id]: next }));
  };

  const rollMvp = async (team: Team) => {
    try {
      const nominees = nomineesFor(team);
      const online = getActiveOnlineMatch();
      if (online) {
        const response = await online.runProgressionCommand({
          type: "award-mvp",
          teamId: team.id,
          nominatedPlayerIds: nominees,
        });
        if (!response.ok) throw new Error(response.reason ?? "MVP rejected");
        const result = response.events.find(
          (event) => event.name === GameEventNames.MvpAwarded
        )?.data as { playerId: string; roll: number } | undefined;
        if (result) {
          setMvpResults((previous) => ({
            ...previous,
            [team.id]: { playerId: result.playerId, roll: result.roll },
          }));
        }
      } else {
        const roll = container.rngService.rollDie(nominees.length);
        tracker.awardMvp(team.id, nominees, roll);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const assignAwardedTouchdown = async (team: Team) => {
    const playerId = touchdownRecipients[team.id];
    if (!playerId) return;
    try {
      const online = getActiveOnlineMatch();
      if (online) {
        const response = await online.runProgressionCommand({
          type: "assign-awarded-touchdown",
          playerId,
        });
        if (!response.ok) {
          throw new Error(response.reason ?? "Touchdown assignment rejected");
        }
      } else {
        tracker.assignAwardedTouchdown(playerId);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const confirmSpp = () => {
    try {
      const finalSummary = tracker.applySpp(teams);
      ownedTeams(teams).forEach(saveTeam);
      setSummary(finalSummary);
      setConfirmed(true);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

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
      const team = own.find(
        (candidate) => candidate.id === selectedPlayer.teamId
      );
      if (team) {
        team.teamValue = calculateTeamValue(team);
        saveTeam(team);
      }
      resetAdvancementForm();
      refresh((value) => value + 1);
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
  const canFinish = !ownPlayers.some(mustAdvance);

  return (
    <div className="absolute inset-0 z-[250] overflow-auto bg-slate-950/95 p-6 text-bb-parchment pointer-events-auto">
      <div className="mx-auto max-w-6xl rounded-xl border-2 border-bb-gold bg-slate-900 p-6 shadow-2xl">
        <h1 className="font-heading text-4xl text-bb-gold">
          Post-match progression
        </h1>
        <p className="mb-5 font-body text-lg">
          Review the match, roll each MVP, then confirm SPP before advancing
          players.
        </p>

        {!confirmed && (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              {own.map((team) => {
                const eligibleIds = tracker.getEligibleMvpPlayers(team.id);
                const nominees = nomineesFor(team);
                const result = mvpResults[team.id];
                return (
                  <section
                    key={team.id}
                    className="rounded-lg border border-bb-dark-gold bg-slate-800 p-4"
                  >
                    <h2 className="font-heading text-2xl text-bb-gold">
                      {team.name} MVP
                    </h2>
                    <p className="mb-3 text-sm">
                      Nominate six players who took part. Their displayed order
                      is slots 1–6.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {eligibleIds.map((playerId) => {
                        const player = team.players.find(
                          (candidate) => candidate.id === playerId
                        )!;
                        const slot = nominees.indexOf(playerId);
                        return (
                          <button
                            key={playerId}
                            disabled={!!result}
                            onClick={() => toggleNominee(team, playerId)}
                            className={`rounded border px-3 py-2 text-left ${
                              slot >= 0
                                ? "border-bb-gold bg-bb-blood-red"
                                : "border-slate-600 bg-slate-700"
                            }`}
                          >
                            {slot >= 0 ? `${slot + 1}. ` : ""}#{player.number}{" "}
                            {player.playerName}
                          </button>
                        );
                      })}
                    </div>
                    {result ? (
                      <p className="mt-3 font-heading text-xl text-bb-gold">
                        Rolled {result.roll}:{" "}
                        {
                          team.players.find(
                            (player) => player.id === result.playerId
                          )?.playerName
                        }{" "}
                        gains 4 SPP
                      </p>
                    ) : (
                      <button
                        onClick={() => void rollMvp(team)}
                        disabled={
                          nominees.length !== Math.min(6, eligibleIds.length)
                        }
                        className="mt-4 rounded border-2 border-bb-gold bg-bb-blood-red px-5 py-3 font-heading text-xl disabled:opacity-40"
                      >
                        Roll MVP D6
                      </button>
                    )}
                    <div className="mt-5 border-t border-slate-600 pt-4">
                      <p className="mb-2 text-sm">
                        If this team was awarded a touchdown after a concession,
                        assign its 3 SPP here. Repeat for each awarded
                        touchdown.
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select
                          aria-label={`${team.name} awarded touchdown recipient`}
                          value={touchdownRecipients[team.id] ?? ""}
                          onChange={(event) =>
                            setTouchdownRecipients((previous) => ({
                              ...previous,
                              [team.id]: event.target.value,
                            }))
                          }
                          className="min-w-0 flex-1 rounded bg-slate-950 p-2"
                        >
                          <option value="">Choose a player</option>
                          {team.players
                            .filter((player) => player.playerKind !== "star")
                            .map((player) => (
                              <option key={player.id} value={player.id}>
                                #{player.number} {player.playerName}
                              </option>
                            ))}
                        </select>
                        <button
                          disabled={!touchdownRecipients[team.id]}
                          onClick={() => void assignAwardedTouchdown(team)}
                          className="rounded bg-bb-ink-blue px-4 py-2 disabled:opacity-40"
                        >
                          Assign touchdown
                        </button>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>

            <StatsTables teams={teams} summary={statsSummary} />
            <button
              onClick={confirmSpp}
              disabled={pendingMvpTeams.length > 0}
              className="mt-5 rounded border-2 border-bb-gold bg-bb-blood-red px-6 py-3 font-heading text-xl disabled:opacity-40"
            >
              Confirm and assign SPP
            </button>
          </>
        )}

        {confirmed && (
          <>
            <StatsTables teams={teams} summary={summary!} />
            <section className="mt-6 rounded-lg border border-bb-dark-gold bg-slate-800 p-4">
              <h2 className="font-heading text-2xl text-bb-gold">
                Player advancement
              </h2>
              <select
                value={selectedPlayerId}
                onChange={(event) => {
                  setSelectedPlayerId(event.target.value);
                  resetAdvancementForm();
                }}
                className="mt-3 w-full rounded bg-slate-950 p-3"
              >
                <option value="">Choose an advanceable player</option>
                {ownPlayers.filter(canAdvance).map((player) => (
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
                    setAccess(
                      next === "chosen-secondary" ? "secondary" : "primary"
                    );
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
                      rollRandomPrimaryCandidates(
                        selectedPlayer,
                        category,
                        container.rngService
                      )
                    );
                  }}
                  characteristicRoll={characteristicRoll}
                  rollCharacteristic={() =>
                    setCharacteristicRoll(container.rngService.rollDie(8))
                  }
                  applyChoice={applyChoice}
                />
              )}
            </section>

            <button
              onClick={() => navigate("/")}
              disabled={!canFinish}
              title={
                canFinish
                  ? undefined
                  : "A player at the characteristic threshold must advance"
              }
              className="mt-5 rounded border-2 border-bb-gold bg-bb-blood-red px-6 py-3 font-heading text-xl disabled:opacity-40"
            >
              Finish post-match
            </button>
          </>
        )}

        {error && <p className="mt-4 text-red-300">{error}</p>}
      </div>
    </div>
  );
}

function StatsTables({
  teams,
  summary,
}: {
  teams: Team[];
  summary: MatchStatsSummary;
}) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      {teams.map((team) => (
        <section key={team.id} className="overflow-auto">
          <h2 className="font-heading text-2xl text-bb-gold">{team.name}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-bb-gold">
                <th>Player</th>
                <th>CMP</th>
                <th>TTM</th>
                <th>INT</th>
                <th>CAS</th>
                <th>TD</th>
                <th>MVP</th>
                <th>SPP</th>
              </tr>
            </thead>
            <tbody>
              {team.players.map((player) => {
                const stats = summary.players.find(
                  (entry) => entry.playerId === player.id
                );
                if (!stats?.participated) return null;
                return (
                  <tr key={player.id} className="border-t border-slate-700">
                    <td className="py-1">{player.playerName}</td>
                    <td>{stats.completions}</td>
                    <td>{stats.superbThrows + stats.safeLandings}</td>
                    <td>{stats.interceptions}</td>
                    <td>{stats.casualties}</td>
                    <td>{stats.touchdowns}</td>
                    <td>{stats.mvps}</td>
                    <td className="font-bold text-bb-gold">
                      +{stats.sppEarned}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
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
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.kind}
            disabled={player.spp < option.cost}
            onClick={() => setKind(option.kind)}
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
            onClick={rollCharacteristic}
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
