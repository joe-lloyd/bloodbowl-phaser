import { useState } from "react";
import { type Team, hasBlockingPendingDevelopment, playerValue } from "../../../types/Team";
import type { Player } from "../../../types/Player";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import { thousands } from "../../../game/rules/club";
import {
  AGENT_FEE_PER_SEASON,
  CLUB_REDRAFT_CAP,
  type RedraftChoice,
  REDRAFT_BASE_BUDGET,
  REDRAFT_BONUS_PER_WIN,
  currentLineUp,
  redraftCost,
  rehirePrice,
  rookiePrice,
  squadMinimum,
} from "../../../game/rules/redraft";
import {
  MAX_ASSISTANT_COACHES,
  MAX_CHEERLEADERS,
  MAX_TEAM_REROLLS,
} from "../../../game/rules/sevensPrices";
import { clubRedraftBudget, confirmRedraft } from "../../../competition/offSeason";
import { homeLeagueOf } from "../../../competition/homeLeague";
import { errorText } from "../../errorText";
import { Field, HudButton, Notice, Section } from "../componentWarehouse/HudKit";
import { PostGameSteps } from "./PostGameSteps";

type Update = (change: Partial<RedraftChoice>) => void;

function budgetText(club: Team, budget: number): string {
  const wins = homeLeagueOf(club).redraftWins ?? 0;
  const full = REDRAFT_BASE_BUDGET + club.treasury + REDRAFT_BONUS_PER_WIN * wins;
  const parts = `${thousands(REDRAFT_BASE_BUDGET)}, plus ${thousands(club.treasury)} in the treasury, plus ${thousands(REDRAFT_BONUS_PER_WIN)} for each of ${String(wins)} wins`;
  return full > budget
    ? `${parts}, capped at ${thousands(CLUB_REDRAFT_CAP)}.`
    : `${parts}.`;
}

function PlayerRow({
  player,
  kept,
  onToggle,
}: {
  player: Player;
  kept: boolean;
  onToggle: () => void;
}) {
  const seasons = player.seasons ?? 0;
  return (
    <tr>
      <td>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="hud-check" checked={kept} onChange={onToggle} />
          #{player.number} {player.playerName}
        </label>
      </td>
      <td>{player.positionName}</td>
      <td className="num">{thousands(playerValue(player))}</td>
      <td className="num">{seasons}</td>
      <td className="num font-hud-label font-bold text-hud-gold">{thousands(rehirePrice(player))}</td>
    </tr>
  );
}

function Players({ club, choice, update }: { club: Team; choice: RedraftChoice; update: Update }) {
  const toggle = (id: string) => {
    update({
      keep: choice.keep.includes(id)
        ? choice.keep.filter((kept) => kept !== id)
        : [...choice.keep, id],
    });
  };
  return (
    <div className="overflow-x-auto">
      <table className="hud-table">
        <thead>
          <tr>
            <th>Keep</th>
            <th>Position</th>
            <th className="num">Value</th>
            <th className="num">Seasons</th>
            <th className="num">Price</th>
          </tr>
        </thead>
        <tbody>
          {club.players.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              kept={choice.keep.includes(player.id)}
              onToggle={() => {
                toggle(player.id);
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CountChoice({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="hud-field"
        value={value}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      >
        {Array.from({ length: max + 1 }, (_, count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Staff({ club, choice, update }: { club: Team; choice: RedraftChoice; update: Update }) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <CountChoice label="Team re-rolls" value={choice.rerolls} max={MAX_TEAM_REROLLS} onChange={(rerolls) => { update({ rerolls }); }} />
      <CountChoice label="Assistant Coaches" value={choice.coaches} max={MAX_ASSISTANT_COACHES} onChange={(coaches) => { update({ coaches }); }} />
      <CountChoice label="Cheerleaders" value={choice.cheerleaders} max={MAX_CHEERLEADERS} onChange={(cheerleaders) => { update({ cheerleaders }); }} />
      {getRosterByRosterName(club.rosterName).apothecary && (
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2 font-hud-body text-hud-base">
          <input
            type="checkbox"
            className="hud-check"
            checked={choice.apothecary}
            onChange={() => {
              update({ apothecary: !choice.apothecary });
            }}
          />
          Apothecary
        </label>
      )}
    </div>
  );
}

function SquadHint({ club, kept }: { club: Team; kept: number }) {
  return (
    <p className="mt-2 font-hud-body text-hud-sm text-hud-dim">
      {kept} players kept. A squad needs at least {squadMinimum(club)}, and a
      rookie Lineman costs {thousands(rookiePrice(club))} from what is left.
    </p>
  );
}

export function RedraftStep({ club, onDone }: { club: Team; onDone: () => void }) {
  const budget = clubRedraftBudget(club) ?? REDRAFT_BASE_BUDGET;
  const [choice, setChoice] = useState<RedraftChoice>(() => currentLineUp(club));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cost = redraftCost(club, choice);
  const waiting = hasBlockingPendingDevelopment(club);
  const update: Update = (change) => {
    setChoice((current) => ({ ...current, ...change }));
  };
  const confirm = async () => {
    setBusy(true);
    try {
      await confirmRedraft(club.id, choice);
      onDone();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Redraft">
      <PostGameSteps club={club} />
      <p className="mb-2 font-hud-body text-hud-base text-hud-bone">
        Budget {thousands(budget)}: {budgetText(club, budget)}
      </p>
      <p className="mb-4 font-hud-body text-hud-sm text-hud-dim">
        Buy back each player at their value plus{" "}
        {thousands(AGENT_FEE_PER_SEASON)} for every season they have played. Players you do
        not keep leave the club. What is left of the budget becomes the
        treasury, for rookies on the team sheet.
      </p>
      <Players club={club} choice={choice} update={update} />
      <SquadHint club={club} kept={choice.keep.length} />
      <Staff club={club} choice={choice} update={update} />
      <p className="mt-4 font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em]">
        <span className={cost > budget ? "text-hud-bad-soft" : "text-hud-gold"}>
          {thousands(cost)}
        </span>{" "}
        of {thousands(budget)}
      </p>
      {error && (
        <Notice tone="bad" role="alert" className="mt-4">
          {error}
        </Notice>
      )}
      <HudButton
        variant="primary"
        className="mt-4"
        disabled={busy || waiting || cost > budget}
        onClick={() => void confirm()}
      >
        Confirm the redraft
      </HudButton>
    </Section>
  );
}
