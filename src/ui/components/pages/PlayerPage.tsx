import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PlayerStats } from "../../../types/Player";
import { loadTeams, saveTeam } from "../../../game/managers/TeamManager";
import { canAdvance, mustAdvance } from "../../../game/progression/progression";
import { RNGService } from "../../../services/rng/RNGService";
import { PlayerDevelopment } from "../hud/PlayerDevelopment";
import Parchment from "../componentWarehouse/Parchment";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import { Button } from "../componentWarehouse/Button";
import { Title } from "../componentWarehouse/Titles";

const STAT_LABELS: Record<keyof PlayerStats, string> = {
  MA: "Movement",
  ST: "Strength",
  AG: "Agility",
  PA: "Passing",
  AV: "Armour",
};

/**
 * Manage Team's per-player development page (overhaul-team-lifecycle-
 * management, player-development-page capability). This is the only place
 * standard SPP advancement is applied — post-match only records SPP and
 * flags who has pending development, it never assigns a skill directly.
 *
 * Advancement mode: this page always offers standard SPP spending. Matched
 * Play and Sevens Skill Selection teams don't earn SPP (see
 * team-advancement-modes), so `canAdvance` naturally stays false for their
 * players here — this page needs no separate mode check of its own.
 */
export function PlayerPage() {
  const navigate = useNavigate();
  const { teamId, playerId } = useParams<{
    teamId: string;
    playerId: string;
  }>();
  const [, setRefreshTick] = useState(0);
  const rngService = useMemo(() => new RNGService(Date.now()), []);

  const teams = loadTeams();
  const team = teams.find((candidate) => candidate.id === teamId);
  const player = team?.players.find((candidate) => candidate.id === playerId);

  if (!team || !player) {
    return (
      <MinHeightContainer className="bg-bb-parchment">
        <Parchment $intensity="low" />
        <ContentContainer>
          <Title>Player not found</Title>
          <Button onClick={() => navigate(`/build-team/${teamId ?? ""}`)}>
            Back to Manage Team
          </Button>
        </ContentContainer>
      </MinHeightContainer>
    );
  }

  const refresh = () => setRefreshTick((value) => value + 1);

  const startingSkillNames = new Set(
    player.skills
      .map((skill) => skill.type)
      .filter(
        (type) =>
          !(player.advancements ?? []).some((advancement) =>
            advancement.type !== "characteristic"
              ? advancement.name === type
              : false
          )
      )
  );
  const startingSkills = player.skills.filter((skill) =>
    startingSkillNames.has(skill.type)
  );
  const gainedSkills = player.skills.filter(
    (skill) => !startingSkillNames.has(skill.type)
  );

  const characteristicRows = (Object.keys(player.stats) as (keyof PlayerStats)[]).map(
    (stat) => {
      const current = player.stats[stat];
      const base = player.baseStats[stat];
      const advances = player.characteristicAdvances?.[stat] ?? 0;
      return { stat, current, base, advances };
    }
  );

  const eligible = canAdvance(player);
  const required = mustAdvance(player);

  return (
    <MinHeightContainer className="bg-bb-parchment !justify-start pb-12">
      <Parchment $intensity="low" />
      <ContentContainer>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Title>
              #{player.number} {player.playerName}
            </Title>
            <p className="font-body text-bb-muted-text">
              {player.positionName} · Level {player.level} · {team.name}
            </p>
          </div>
          <Button onClick={() => navigate(`/build-team/${team.id}`)}>
            Back to Manage Team
          </Button>
        </div>

        <section className="mb-6 rounded-lg border border-bb-divider bg-bb-warm-paper p-5 shadow-parchment-light">
          <h2 className="font-heading text-2xl text-bb-blood-red mb-3">
            Characteristics
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {characteristicRows.map(({ stat, current, base, advances }) => (
              <div
                key={stat}
                className="rounded border border-bb-divider bg-white/40 p-3 text-center"
              >
                <div className="text-xs uppercase font-bold text-bb-dark-gold">
                  {STAT_LABELS[stat]}
                </div>
                <div className="font-heading text-2xl">{current}</div>
                {current !== base && (
                  <div className="text-xs text-bb-muted-text">
                    base {base}
                    {advances > 0 ? `, +${advances} advance(s)` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-bb-divider bg-bb-warm-paper p-5 shadow-parchment-light">
          <h2 className="font-heading text-2xl text-bb-blood-red mb-3">
            Skills
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-heading text-lg text-bb-dark-gold mb-2">
                Starting skills
              </h3>
              {startingSkills.length === 0 ? (
                <p className="font-body italic text-bb-muted-text">None</p>
              ) : (
                <ul className="font-body space-y-1">
                  {startingSkills.map((skill) => (
                    <li key={skill.type}>{skill.type}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="font-heading text-lg text-bb-dark-gold mb-2">
                Gained skills
              </h3>
              {gainedSkills.length === 0 ? (
                <p className="font-body italic text-bb-muted-text">None</p>
              ) : (
                <ul className="font-body space-y-1">
                  {gainedSkills.map((skill) => {
                    const advancement = (player.advancements ?? []).find(
                      (candidate) => candidate.name === skill.type
                    );
                    return (
                      <li key={skill.type}>
                        {skill.type}
                        {advancement && (
                          <span className="ml-2 text-xs text-bb-muted-text">
                            ({advancement.type.replace("-", " ")}, {" "}
                            {advancement.sppCost} SPP
                            {advancement.elite ? ", elite" : ""})
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-bb-divider bg-bb-warm-paper p-5 shadow-parchment-light">
          <h2 className="font-heading text-2xl text-bb-blood-red mb-3">
            Injuries
          </h2>
          {player.injuries.length === 0 ? (
            <p className="font-body italic text-bb-muted-text">
              No permanent injuries.
            </p>
          ) : (
            <ul className="font-body space-y-1">
              {player.injuries.map((injury, index) => (
                <li key={`${injury}-${index}`}>{injury}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-6 rounded-lg border border-bb-divider bg-bb-warm-paper p-5 shadow-parchment-light">
          <h2 className="font-heading text-2xl text-bb-blood-red mb-3">
            SPP &amp; career statistics
          </h2>
          <p className="font-body mb-2">
            {player.spp} SPP available
            {required && (
              <span className="ml-2 font-bold text-bb-blood-red">
                — must advance
              </span>
            )}
          </p>
          {player.careerStats ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 font-body">
              <Stat label="Matches" value={player.careerStats.matches} />
              <Stat
                label="Completions"
                value={player.careerStats.completions}
              />
              <Stat
                label="Interceptions"
                value={player.careerStats.interceptions}
              />
              <Stat label="Casualties" value={player.careerStats.casualties} />
              <Stat
                label="Touchdowns"
                value={player.careerStats.touchdowns}
              />
              <Stat label="MVPs" value={player.careerStats.mvps} />
            </div>
          ) : (
            <p className="font-body italic text-bb-muted-text">
              This player has not appeared in a recorded match yet.
            </p>
          )}
          <p className="mt-3 font-body text-sm text-bb-muted-text">
            Provenance: {player.playerKind ?? "roster"} player
            {team.seedMetadata ? " (development seed data)" : ""}
          </p>
        </section>

        <section className="mb-6 rounded-lg border border-bb-divider bg-bb-warm-paper p-5 shadow-parchment-light">
          <h2 className="font-heading text-2xl text-bb-blood-red mb-3">
            Pending development
          </h2>
          {!eligible ? (
            <p className="font-body italic text-bb-muted-text">
              Not enough SPP to advance yet.
            </p>
          ) : (
            <PlayerDevelopment
              player={player}
              team={team}
              rngService={rngService}
              onApplied={() => {
                // Keep Manage Team's pending-development queue consistent
                // with an advancement applied from this page directly —
                // otherwise a resolved entry lingers and blocks the team's
                // next required fixture (team-advancement-modes).
                if (!mustAdvance(player)) {
                  team.pendingDevelopment = (
                    team.pendingDevelopment ?? []
                  ).filter(
                    (entry) =>
                      !(
                        entry.kind === "advanced-league-advancement" &&
                        entry.playerId === player.id
                      )
                  );
                }
                saveTeam(team);
                refresh();
              }}
            />
          )}
        </section>
      </ContentContainer>
    </MinHeightContainer>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-bb-divider bg-white/40 p-2 text-center">
      <div className="text-[11px] uppercase font-bold text-bb-dark-gold">
        {label}
      </div>
      <div className="font-heading text-xl">{value}</div>
    </div>
  );
}
