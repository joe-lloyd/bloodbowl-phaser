import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { type Player, type PlayerStats } from "../../../types/Player";
import type { Team } from "../../../types/Team";
import { loadTeams } from "../../../game/managers/TeamManager";
import {
  canAdvance,
  mustAdvance,
  nextAdvancementCosts,
} from "../../../game/progression/progression";
import { RNGService } from "../../../services/rng/RNGService";
import { PlayerDevelopment } from "../hud/PlayerDevelopment";
import { PlayerPortrait } from "../common/PlayerPortrait";
import { numToHex } from "../TeamManagement/TeamStatsOverview";
import {
  Chip,
  EmptyState,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Panel,
  Section,
  Stat,
} from "../componentWarehouse/HudKit";

const STAT_LABELS: Record<keyof PlayerStats, string> = {
  MA: "Movement",
  ST: "Strength",
  AG: "Agility",
  PA: "Passing",
  AV: "Armour",
};

export function PlayerPage() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { teamId, playerId } = useParams<{
    teamId: string;
    playerId: string;
  }>();
  const [, setRefreshTick] = useState(0);
  const [notice, setNotice] = useState("");
  const rngService = useMemo(() => new RNGService(Date.now()), []);

  const teams = loadTeams();
  const team = teams.find((candidate) => candidate.id === teamId);
  const player = team?.players.find((candidate) => candidate.id === playerId);

  if (!team || !player) {
    return (
      <PageShell width="narrow" className="flex flex-col justify-center">
        <EmptyState
          title="Player not found"
          titleAs="h2"
          action={
            <HudButton
              variant="ghost"
              onClick={() => navigate(`/build-team/${teamId ?? ""}${search}`)}
            >
              Back to Manage Team
            </HudButton>
          }
        />
      </PageShell>
    );
  }

  const refresh = () => {
    setRefreshTick((value) => value + 1);
  };

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

  const characteristicRows = (
    Object.keys(player.stats) as (keyof PlayerStats)[]
  ).map((stat) => {
    const current = player.stats[stat];
    const base = player.baseStats[stat];
    const advances = player.characteristicAdvances?.[stat] ?? 0;
    return { stat, current, base, advances };
  });

  const eligible = canAdvance(player);
  const costs = nextAdvancementCosts(player);
  const required = mustAdvance(player);

  return (
    <PageShell width="medium">
      <PageHeader
        eyebrow={`${player.positionName} · Level ${String(player.level)} · ${team.name}`}
        title={`#${String(player.number)} ${player.playerName}`}
        actions={
          <HudButton
            variant="ghost"
            onClick={() => navigate(`/build-team/${team.id}${search}`)}
          >
            Back to Manage Team
          </HudButton>
        }
      />

      <div className="grid gap-x-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
        <PlayerSprite player={player} team={team} />
        <div className="min-w-0">
          <Section title="Characteristics">
            <div className="flex gap-2">
              {characteristicRows.map(({ stat, current, base }) => (
                <Stat
                  key={stat}
                  label={STAT_LABELS[stat]}
                  value={current}
                  {...(current !== base ? { tone: "gold" as const } : {})}
                />
              ))}
            </div>
            {characteristicRows.some(
              ({ current, base }) => current !== base
            ) && (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-hud-sm text-hud-dim">
                {characteristicRows
                  .filter(({ current, base }) => current !== base)
                  .map(({ stat, base, advances }) => (
                    <li key={stat}>
                      {STAT_LABELS[stat]}: base {base}
                      {advances > 0 ? `, +${String(advances)} advance(s)` : ""}
                    </li>
                  ))}
              </ul>
            )}
          </Section>

          <Section title="Skills">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="hud-label mb-2 text-hud-gold">
                  Starting skills
                </h3>
                {startingSkills.length === 0 ? (
                  <p className="text-hud-mute">None</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {startingSkills.map((skill) => (
                      <li key={skill.type}>
                        <Chip>{skill.type}</Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="hud-label mb-2 text-hud-gold">Gained skills</h3>
                {gainedSkills.length === 0 ? (
                  <p className="text-hud-mute">None</p>
                ) : (
                  <ul className="space-y-1.5">
                    {gainedSkills.map((skill) => {
                      const advancement = (player.advancements ?? []).find(
                        (candidate) => candidate.name === skill.type
                      );
                      return (
                        <li key={skill.type}>
                          <Chip tone="skill">{skill.type}</Chip>
                          {advancement && (
                            <span className="ml-2 text-hud-sm text-hud-dim">
                              ({advancement.type.replace("-", " ")},{" "}
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
          </Section>
        </div>
      </div>

      <Section title="Injuries">
        {player.injuries.length === 0 ? (
          <p className="text-hud-mute">No permanent injuries.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {player.injuries.map((injury, index) => (
              <li key={`${injury}-${String(index)}`}>
                <Chip tone="bad">{injury}</Chip>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <SppAndCareer player={player} team={team} required={required} />

      <Section
        title="Pending development"
        accent={required ? "blood" : undefined}
      >
        {notice && (
          <Notice tone="info" role="status" className="mb-3">
            {notice}
          </Notice>
        )}
        {!eligible ? (
          <p className="text-hud-mute">
            {costs
              ? `Not enough SPP to advance yet: ${String(player.spp)} SPP, and the cheapest advancement (Random Primary) costs ${String(costs.randomPrimary)}.`
              : "This player is a Legend and cannot advance further."}
          </p>
        ) : (
          <PlayerDevelopment
            player={player}
            team={team}
            rngService={rngService}
            onSaved={() => {
              setNotice("");
              refresh();
            }}
            onNotice={setNotice}
          />
        )}
      </Section>
    </PageShell>
  );
}

const SPRITE_BOX = 240;

function PlayerSprite({ player, team }: { player: Player; team: Team }) {
  return (
    <Panel
      accent={{ color: numToHex(team.colors.primary) }}
      className="mx-auto mb-6 w-fit p-3 md:mx-0"
      data-testid="player-sprite"
    >
      <figure className="flex flex-col items-center gap-2">
        <div
          className="flex items-end justify-center"
          style={{ width: SPRITE_BOX, height: SPRITE_BOX }}
        >
          <PlayerPortrait
            rosterName={team.rosterName}
            positionName={player.positionName}
            colors={team.colors}
            size={SPRITE_BOX}
            wholePixels
          />
        </div>
        <figcaption className="hud-label text-center text-hud-2xs">
          {player.positionName} · {team.rosterName}
        </figcaption>
      </figure>
    </Panel>
  );
}

function SppAndCareer({
  player,
  team,
  required,
}: {
  player: Player;
  team: Team;
  required: boolean;
}) {
  return (
    <Section title="SPP & career statistics">
      <p className="mb-3 text-hud-base text-hud-bone">
        {player.spp} SPP available
        {required && (
          <span className="ml-2 font-bold text-hud-blood-hot">
            — must advance
          </span>
        )}
      </p>
      {player.careerStats ? (
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
          <Stat label="Matches" value={player.careerStats.matches} />
          <Stat label="Completions" value={player.careerStats.completions} />
          <Stat
            label="Interceptions"
            value={player.careerStats.interceptions}
          />
          <Stat label="Casualties" value={player.careerStats.casualties} />
          <Stat label="Touchdowns" value={player.careerStats.touchdowns} />
          <Stat label="MVPs" value={player.careerStats.mvps} />
        </div>
      ) : (
        <p className="text-hud-mute">
          This player has not appeared in a recorded match yet.
        </p>
      )}
      <p className="mt-3 text-hud-sm text-hud-mute">
        Provenance: {player.playerKind ?? "roster"} player
        {team.seedMetadata ? " (development seed data)" : ""}
      </p>
    </Section>
  );
}
