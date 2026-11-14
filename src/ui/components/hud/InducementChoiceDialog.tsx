import { DecisionTeam } from "./DecisionTeam";
import React, { useEffect, useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { DecisionRequest } from "@/types/decisions";
import { GameEventNames } from "@/types/events";
import {
  InducementChoiceDecisionAnswer,
  InducementChoiceDecisionRequest,
  InducementChoiceKind,
  WizardSpell,
} from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
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
};

/** What each spell does, in a line, and what the pitch picks for it. */
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

/**
 * A Prayer to Nuffle or Desperate Measure waiting on its coach's pick. The
 * engine is paused on this decision; each button answers it through
 * gameService.answerInducementChoice.
 */
export const InducementChoiceDialog: React.FC<InducementChoiceDialogProps> = ({
  eventBus,
}) => {
  const [request, setRequest] =
    useState<InducementChoiceDecisionRequest | null>(null);
  // Sports-Wizard: the spell picked, whose target the pitch is choosing
  const [spell, setSpell] = useState<WizardSpell | null>(null);
  const aim = (next: WizardSpell | null) => {
    setSpell(next);
    eventBus.emit(GameEventNames.UI_WizardTargeting, { spell: next });
  };

  useEffect(() => {
    const onRequested = (data: DecisionRequest) => {
      if (data.type === "inducement-choice") {
        setRequest(data);
        setSpell(null);
      }
    };
    // The other coach may be the one who answers
    const onResolved = ({ type }: { type: string }) => {
      if (type !== "inducement-choice") return;
      setRequest(null);
      setSpell(null);
      eventBus.emit(GameEventNames.UI_WizardTargeting, { spell: null });
    };
    eventBus.on(GameEventNames.DecisionRequested, onRequested);
    eventBus.on(GameEventNames.DecisionResolved, onResolved);
    return () => {
      eventBus.off(GameEventNames.DecisionRequested, onRequested);
      eventBus.off(GameEventNames.DecisionResolved, onResolved);
    };
  }, [eventBus]);

  // Online, only the coach who owns the decision sees it; the other
  // coach has the "Waiting for…" banner
  if (
    !request ||
    !ServiceContainer.isInitialized() ||
    getActiveOnlineMatch()?.mayAct() === false
  )
    return null;
  const gameService = ServiceContainer.getInstance().gameService;
  const name = (id: string) => gameService.getPlayerById(id)?.playerName ?? id;

  const answer = (choice: InducementChoiceDecisionAnswer) => {
    // Online: only the choosing coach may answer
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (gameService.answerInducementChoice(choice)) setRequest(null);
  };

  if (request.kind === "sports-wizard") {
    return (
      <DialogShell
        testId="sports-wizard-dialog"
        placement="dock"
        eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
        title={spell ? SPELLS[spell].aim : TITLES[request.kind]}
        width="w-[520px]"
        actions={
          spell ? (
            <HudButton variant="ghost" block onClick={() => aim(null)}>
              Back
            </HudButton>
          ) : (
            <HudButton variant="ghost" block onClick={() => answer({})}>
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
                onClick={() => aim(option)}
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
      return [{ label: name(playerId), choice: { playerId } }];
    });

  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      title={TITLES[request.kind]}
      width="w-[520px]"
      backdrop="heavy"
      className="max-h-[80vh] overflow-y-auto hud-scroll"
      actions={
        request.optional && (
          <HudButton variant="ghost" block onClick={() => answer({})}>
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
            onClick={() => answer(option.choice)}
          >
            {option.label}
          </HudButton>
        ))}
      </div>
    </DialogShell>
  );
};
