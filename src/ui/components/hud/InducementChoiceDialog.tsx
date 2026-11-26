import { useGameDecision } from "../../hooks/useDecisionRequest";
import { DecisionTeam } from "./DecisionTeam";
import type React from "react";
import { useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import {
  type InducementChoiceDecisionAnswer,
  type InducementChoiceDecisionRequest,
  type InducementChoiceKind,
  type WizardSpell,
} from "@/types/decisions";
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";

interface InducementChoiceDialogProps {
  eventBus: EventBus;
}

const TITLES: Record<InducementChoiceKind, string> = {
  "iron-man": "Iron Man: +1 AV for the game",
  "knuckle-dusters": "Knuckle Dusters: Mighty Blow for the game",
  "intensive-training": "Intensive Training: pick a Primary skill",
  hangover: "Hangover: who misses the first drive?",
  "you-dope": "You Dope!: +1 ST or +1 AG for the game",
  "team-captain": "Appoint a new Team Captain",
  "sports-wizard": "Sports-Wizard: cast a spell?",
  "magic-potion": "Magic Potion: who drinks it?",
  "lesser-magic-potion": "Lesser Magic Potion: who drinks it?",
  "superior-magic-potion": "Superior Magic Potion: who drinks it?",
  souvenir: "Souvenir: who carries it this half?",
  "novice-wizard": "Novice Wizard: cast a spell at an opponent?",
};

const titleOf = (request: InducementChoiceDecisionRequest): string =>
  request.item
    ? `${TITLES[request.kind]} (${request.item})`
    : TITLES[request.kind];

const SPELLS: Record<
  WizardSpell,
  { label: string; hint: string; aim: string }
> = {
  fireball: {
    label: "Fireball",
    hint: "Each player in or next to a square is hit on 4+: Knocked Down, Armour +1",
    aim: "Fireball: click the square to aim at",
  },
  zap: {
    label: "Zap!",
    hint: "A Frog until the drive ends, on a D6 of their ST or more",
    aim: "Zap!: click the player to zap",
  },
};

export const InducementChoiceDialog: React.FC<InducementChoiceDialogProps> = ({
  eventBus,
}) => {
  const [spell, setSpell] = useState<WizardSpell | null>(null);
  const aim = (next: WizardSpell | null) => {
    setSpell(next);
    eventBus.emit(GameEventNames.UI_WizardTargeting, { spell: next });
  };

  const decision = useGameDecision(eventBus, {
    type: "inducement-choice",
    onChange: (next) => {
      setSpell(null);
      if (!next)
        eventBus.emit(GameEventNames.UI_WizardTargeting, { spell: null });
    },
  });

  if (!decision) return null;
  const { request, gameService, name } = decision;

  const answer = (choice: InducementChoiceDecisionAnswer) => {
    decision.answer(() => gameService.answerInducementChoice(choice));
  };

  if (request.kind === "sports-wizard") {
    return (
      <DialogShell
        testId="sports-wizard-dialog"
        placement="dock"
        eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
        title={spell ? SPELLS[spell].aim : TITLES[request.kind]}
        actions={
          spell ? (
            <HudButton
              variant="ghost"
              block
              onClick={() => {
                aim(null);
              }}
            >
              Back
            </HudButton>
          ) : (
            <HudButton
              variant="ghost"
              block
              onClick={() => {
                answer({});
              }}
            >
              Keep it for later
            </HudButton>
          )
        }
      >
        {!spell && (
          <div className="grid grid-cols-2 gap-2">
            {(request.spells ?? []).map((option) => (
              <HudButton
                key={option}
                data-testid={`spell-${option}`}
                variant="secondary"
                className="!h-auto !py-2 !normal-case !tracking-normal text-left"
                onClick={() => {
                  aim(option);
                }}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-bold">{SPELLS[option].label}</span>
                  <span className="text-hud-xs text-hud-dim">
                    {SPELLS[option].hint}
                  </span>
                </span>
              </HudButton>
            ))}
          </div>
        )}
      </DialogShell>
    );
  }

  const options: { label: string; choice: InducementChoiceDecisionAnswer }[] =
    request.playerIds.flatMap((playerId) => {
      if (request.skills) {
        return request.skills.map((skill) => ({
          label: `${name(playerId)}: ${skill}`,
          choice: { playerId, skill },
        }));
      }
      if (request.stats) {
        return request.stats.map((stat) => ({
          label: `${name(playerId)}: +1 ${stat}`,
          choice: { playerId, stat },
        }));
      }
      return { label: name(playerId), choice: { playerId } };
    });

  return (
    <InducementChoiceDialogView
      request={request}
      answer={answer}
      options={options}
    />
  );
};

interface InducementChoiceDialogViewProps {
  request: InducementChoiceDecisionRequest;
  answer: (choice: InducementChoiceDecisionAnswer) => void;
  options: { label: string; choice: InducementChoiceDecisionAnswer }[];
}
function InducementChoiceDialogView({
  request,
  answer,
  options,
}: InducementChoiceDialogViewProps) {
  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      title={titleOf(request)}
      backdrop="heavy"
      className="max-h-[80vh] overflow-y-auto hud-scroll"
      actions={
        request.optional && (
          <HudButton
            variant="ghost"
            block
            onClick={() => {
              answer({});
            }}
          >
            {request.kind === "team-captain"
              ? "Appoint nobody"
              : "Keep it for later"}
          </HudButton>
        )
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <HudButton
            key={option.label}
            variant="secondary"
            className="!h-auto !py-2 !normal-case !tracking-normal text-left"
            onClick={() => {
              answer(option.choice);
            }}
          >
            {option.label}
          </HudButton>
        ))}
      </div>
    </DialogShell>
  );
}
