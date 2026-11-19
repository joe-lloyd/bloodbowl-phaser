import {
  type PlayedGame,
  type PlayedGamePlayer,
} from "../../../game/progression/matchHistory";
import { cx, Section } from "../componentWarehouse/HudKit";

const OUTCOME = {
  win: { letter: "W", tone: "border-hud-good/60 text-hud-good" },
  draw: { letter: "D", tone: "border-white/30 text-hud-bone" },
  loss: { letter: "L", tone: "border-hud-blood/70 text-hud-bad-soft" },
} as const;

const KIND_LABEL: Record<PlayedGame["kind"], string> = {
  online: "Online",
  computer: "Against the computer",
  local: "Local",
};

const ENDING_LABEL: Record<NonNullable<PlayedGame["ending"]>, string> = {
  conceded: "conceded",
  forfeited: "forfeited",
  penalties: "on Penalties",
};

function playerLine(player: PlayedGamePlayer): string {
  const parts = [
    player.touchdowns && `${String(player.touchdowns)} TD`,
    player.casualties && `${String(player.casualties)} CAS`,
    player.completions && `${String(player.completions)} COMP`,
    player.interceptions && `${String(player.interceptions)} INT`,
    player.mvp && "MVP",
    player.injured && "hurt",
  ].filter(Boolean);
  return `#${String(player.number)} ${player.name}: ${parts.join(", ")}`;
}

export function PlayedGames({ games }: { games: PlayedGame[] }) {
  if (games.length === 0) return null;
  return (
    <Section title="Played games">
      <ol data-testid="played-games" className="flex flex-col gap-2">
        {games.map((game) => {
          const outcome = OUTCOME[game.outcome];
          return (
            <li key={game.id}>
              <details className="rounded-hud border border-white/10 bg-black/30 open:border-hud-gold/40">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                  <span
                    className={cx(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-hud border font-hud-display text-hud-base",
                      outcome.tone
                    )}
                  >
                    {outcome.letter}
                  </span>
                  <span className="font-hud-display text-hud-xl text-hud-bone">
                    {game.score.own}–{game.score.opponent}
                  </span>
                  <span className="min-w-0 flex-1 font-hud-label font-bold uppercase tracking-[0.03em] text-hud-bone">
                    vs {game.opponent.name}{" "}
                    <span className="font-normal normal-case text-hud-dim">
                      ({game.opponent.rosterName})
                    </span>
                  </span>
                  <span className="text-hud-sm text-hud-dim">
                    {KIND_LABEL[game.kind]}
                    {game.ending && `, ${ENDING_LABEL[game.ending]}`}
                    {" · "}
                    {new Date(game.playedAt).toLocaleDateString("en-GB")}
                  </span>
                </summary>
                <div className="border-t border-white/10 px-3 py-2 text-hud-sm text-hud-bone">
                  {game.players.length === 0 ? (
                    <p className="text-hud-dim">
                      No touchdowns, casualties or injuries for this team.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {game.players.map((player) => (
                        <li key={player.playerId}>{playerLine(player)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
