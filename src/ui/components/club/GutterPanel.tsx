import type { PlayerTemplate } from "../../../types/Player";
import { PositionKeyWord } from "../../../types/Player";
import type { Team } from "../../../types/Team";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import {
  chooseGutterSitsOut,
  corePlayers,
  gutterSitsOut,
  gutterSpecialist,
  gutterSpecialistRefusal,
  gutterUnlocked,
  hireGutterSpecialist,
  thousands,
} from "../../../game/rules/club";
import { giveIdentity } from "../../../game/names/playerIdentity";
import { Field, HudButton, Section } from "../componentWarehouse/HudKit";
import { GutterProgress } from "./GutterProgress";
export type ClubChange = (team: Team) => string | undefined;

type OnChange = (apply: ClubChange) => void;

function hire(template: PlayerTemplate): ClubChange {
  return (team) => {
    const result = hireGutterSpecialist(team, template);
    if (!result.hired) return result.reason;
    giveIdentity(team, result.player);
    return;
  };
}

function SpecialistChoice({ team, onChange }: { team: Team; onChange: OnChange }) {
  const specialist = gutterSpecialist(team);
  if (specialist)
    return (
      <p className="font-hud-body text-hud-base text-hud-bone">
        Specialist: #{specialist.number} {specialist.playerName} ·{" "}
        {specialist.positionName}. Plays only Gutter Bowl.
      </p>
    );
  const positionals = getRosterByRosterName(team.rosterName).playerTemplates.filter(
    (template) => !template.keywords.includes(PositionKeyWord.LINEMAN)
  );
  return (
    <div className="flex flex-wrap gap-2">
      {positionals.map((template) => {
        const refusal = gutterSpecialistRefusal(team, template);
        return (
          <HudButton
            key={template.positionName}
            disabled={refusal !== undefined}
            title={refusal}
            onClick={() => {
              onChange(hire(template));
            }}
          >
            Hire {template.positionName} · {thousands(template.cost)}
          </HudButton>
        );
      })}
    </div>
  );
}

function SitsOutChoice({ team, onChange }: { team: Team; onChange: OnChange }) {
  const sitsOut = gutterSitsOut(team);
  if (!sitsOut) return null;
  const linemen = corePlayers(team).filter((player) =>
    player.keywords.includes(PositionKeyWord.LINEMAN)
  );
  return (
    <Field
      label="Sits out Gutter Bowl"
      hint="The Core Sevens squad is full, so one Lineman makes room for the specialist. It may be the Veteran."
    >
      <select
        className="hud-field"
        value={sitsOut.id}
        onChange={(event) => {
          const playerId = event.target.value;
          onChange((club) => {
            const decision = chooseGutterSitsOut(club, playerId);
            return decision.allowed ? undefined : decision.reason;
          });
        }}
      >
        {linemen.map((player) => (
          <option key={player.id} value={player.id}>
            #{player.number} {player.playerName}
            {player.veteran ? " (Veteran)" : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function GutterPanel({ team, onChange }: { team: Team; onChange: OnChange }) {
  return (
    <Section title="Gutter Bowl">
      <div className="flex flex-col gap-4">
        <GutterProgress team={team} />
        <p className="font-hud-body text-hud-sm text-hud-dim">
          Gutter Bowl allows a fifth positional. Hire one specialist from the
          treasury. The specialist plays only Gutter Bowl, and the rest of the
          club plays as the Core Sevens squad.
        </p>
        {gutterUnlocked(team) && (
          <>
            <SpecialistChoice team={team} onChange={onChange} />
            <SitsOutChoice team={team} onChange={onChange} />
          </>
        )}
      </div>
    </Section>
  );
}
