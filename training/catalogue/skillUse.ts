import { SkillType } from "../../src/types/Skills";

type SkillUse = "chooses" | "prices" | "engine" | "ignores";

interface CoachUse {
  use: SkillUse;
  note: string;
}

const chooses = (note: string): CoachUse => ({ use: "chooses", note });
const prices = (note: string): CoachUse => ({ use: "prices", note });
const ignores = (note: string): CoachUse => ({ use: "ignores", note });
const ENGINE: CoachUse = {
  use: "engine",
  note: "The rules apply it. The coach's odds leave it out.",
};

const REROLL = "Its re-roll is counted in the odds.";
const BLOCK_DICE = "Counted in the block dice odds.";
const INJURY = "Counted in the injury odds.";
const PASSING = "Counted in pass, catch or interception odds.";
const UNRELIABLE =
  "Plans leave its roll out. It only avoids this player on a touchback.";
const NEVER_OFFERED = "No plan uses it, so the coach never declares it.";
const TEAM_MATE_THROW = "Counted when it aims a team-mate throw.";
const ACCEPTS = "A reaction it always accepts without weighing it.";

export const SKILL_USE: Record<SkillType, CoachUse> = {
  [SkillType.CATCH]: prices(REROLL),
  [SkillType.DEFENSIVE]: prices("Cancels assists in the block dice odds."),
  [SkillType.DIVING_CATCH]: prices(PASSING),
  [SkillType.DIVING_TACKLE]: ENGINE,
  [SkillType.DODGE]: prices(REROLL),
  [SkillType.HIT_AND_RUN]: ignores(ACCEPTS),
  [SkillType.JUMP_UP]: prices("Counted in the cost of standing up."),
  [SkillType.LEAP]: ignores("Routes have no jumps, so it never leaps."),
  [SkillType.SAFE_PAIR_OF_HANDS]: ENGINE,
  [SkillType.SIDESTEP]: prices("Counted when it picks push squares."),
  [SkillType.SPRINT]: prices("Allows a third rush on routes."),
  [SkillType.SURE_FEET]: prices(REROLL),
  [SkillType.DIRTY_PLAYER]: prices(INJURY),
  [SkillType.EYE_GOUGE]: ENGINE,
  [SkillType.FUMBLEROOSKI]: ignores("It never chooses to drop the ball."),
  [SkillType.LETHAL_FLIGHT]: ENGINE,
  [SkillType.LONE_FOULER]: prices(REROLL),
  [SkillType.PILE_DRIVER]: ignores(ACCEPTS),
  [SkillType.PUT_THE_BOOT_IN]: ENGINE,
  [SkillType.QUICK_FOUL]: ENGINE,
  [SkillType.SABOTEUR]: ENGINE,
  [SkillType.SHADOWING]: ignores(ACCEPTS),
  [SkillType.SNEAKY_GIT]: prices("Counted in the chance of being sent off."),
  [SkillType.VIOLENT_INNOVATOR]: ENGINE,
  [SkillType.BLOCK]: prices(BLOCK_DICE),
  [SkillType.DAUNTLESS]: ENGINE,
  [SkillType.FEND]: ENGINE,
  [SkillType.FRENZY]: ENGINE,
  [SkillType.KICK]: ignores(ACCEPTS),
  [SkillType.PRO]: ignores("It never uses Pro on block dice."),
  [SkillType.STEADY_FOOTING]: ENGINE,
  [SkillType.STRIP_BALL]: ENGINE,
  [SkillType.SURE_HANDS]: prices(REROLL),
  [SkillType.TACKLE]: prices("Counted in dodge and block dice odds."),
  [SkillType.TAUNT]: ENGINE,
  [SkillType.WRESTLE]: chooses("Decides when to use Wrestle on a block."),
  [SkillType.BIG_HAND]: prices("Counted in pick-up odds."),
  [SkillType.CLAWS]: prices(INJURY),
  [SkillType.DISTURBING_PRESENCE]: prices(PASSING),
  [SkillType.EXTRA_ARMS]: prices("Counted in pick-up and catch odds."),
  [SkillType.FOUL_APPEARANCE]: ENGINE,
  [SkillType.HORNS]: ENGINE,
  [SkillType.IRON_HARD_SKIN]: prices(INJURY),
  [SkillType.MONSTROUS_MOUTH]: ignores(NEVER_OFFERED),
  [SkillType.PREHENSILE_TAIL]: ENGINE,
  [SkillType.TENTACLES]: ENGINE,
  [SkillType.TWO_HEADS]: prices("Counted in dodge odds."),
  [SkillType.VERY_LONG_LEGS]: prices(
    "Counted for interceptions. It never leaps."
  ),
  [SkillType.ACCURATE]: prices(PASSING),
  [SkillType.CANNONEER]: prices(PASSING),
  [SkillType.CLOUD_BURSTER]: ENGINE,
  [SkillType.DUMP_OFF]: ignores(ACCEPTS),
  [SkillType.GIVE_AND_GO]: ENGINE,
  [SkillType.HAIL_MARY_PASS]: ignores("Left out of pass plans on purpose."),
  [SkillType.LEADER]: ENGINE,
  [SkillType.NERVES_OF_STEEL]: prices(PASSING),
  [SkillType.ON_THE_BALL]: ignores(ACCEPTS),
  [SkillType.PASS]: prices(REROLL),
  [SkillType.PUNT]: chooses("Plans punts up the pitch."),
  [SkillType.SAFE_PASS]: ENGINE,
  [SkillType.ARM_BAR]: ENGINE,
  [SkillType.BRAWLER]: chooses("Re-rolls a block that would knock it down."),
  [SkillType.BREAK_TACKLE]: ENGINE,
  [SkillType.BULLSEYE]: prices(TEAM_MATE_THROW),
  [SkillType.GRAB]: prices("Counted when it picks push squares."),
  [SkillType.GUARD]: prices("Counted as assists in the block dice odds."),
  [SkillType.JUGGERNAUT]: prices(BLOCK_DICE),
  [SkillType.MIGHTY_BLOW]: prices(INJURY),
  [SkillType.MULTIPLE_BLOCK]: chooses("Plans blocks on two targets."),
  [SkillType.STAND_FIRM]: prices(BLOCK_DICE),
  [SkillType.STRONG_ARM]: prices(TEAM_MATE_THROW),
  [SkillType.THICK_SKULL]: prices("Counted in foul injury odds."),
  [SkillType.ALWAYS_HUNGRY]: prices(TEAM_MATE_THROW),
  [SkillType.ANIMAL_SAVAGERY]: ignores(UNRELIABLE),
  [SkillType.ANIMOSITY]: ENGINE,
  [SkillType.BALL_AND_CHAIN]: ignores(NEVER_OFFERED),
  [SkillType.BLOODLUST]: chooses("Plans feeding and decides its reactions."),
  [SkillType.BOMBARDIER]: ignores("Bombs are never offered to any coach."),
  [SkillType.BONE_HEAD]: ignores(UNRELIABLE),
  [SkillType.BREATHE_FIRE]: ignores(NEVER_OFFERED),
  [SkillType.BREATHE_FIRE_ICE]: ignores(NEVER_OFFERED),
  [SkillType.CHAINSAW]: ignores(NEVER_OFFERED),
  [SkillType.DECAY]: ENGINE,
  [SkillType.DRUNKARD]: prices("Counted in rush odds."),
  [SkillType.HATRED]: ENGINE,
  [SkillType.HYPNOTIC_GAZE]: chooses("Plans a Gaze that helps a team-mate."),
  [SkillType.INSIGNIFICANT]: ENGINE,
  [SkillType.KICK_TEAM_MATE]: chooses("Plans kicks of a team-mate."),
  [SkillType.LONER]: ignores(UNRELIABLE),
  [SkillType.MY_BALL]: prices("A pick-up counts its pace over three turns."),
  [SkillType.NO_BALL]: prices("Never plans for it to carry the ball."),
  [SkillType.PICK_ME_UP]: ENGINE,
  [SkillType.PLAGUE_RIDDEN]: ENGINE,
  [SkillType.POGO]: ignores("Routes have no jumps, so it never leaps."),
  [SkillType.PROJECTILE_VOMIT]: ignores(NEVER_OFFERED),
  [SkillType.REALLY_STUPID]: chooses("Moves a team-mate next to it first."),
  [SkillType.REGENERATION]: prices(INJURY),
  [SkillType.RIGHT_STUFF]: chooses("Plans team-mate throws of this player."),
  [SkillType.SECRET_WEAPON]: ENGINE,
  [SkillType.STAB]: ignores(NEVER_OFFERED),
  [SkillType.SQUIG_RAGE]: ENGINE,
  [SkillType.SQUIG_RESTRAINT]: ENGINE,
  [SkillType.STUNTY]: prices("Counted in dodge and injury odds."),
  [SkillType.SWOOP]: ignores("Left out of team-mate throws on purpose."),
  [SkillType.TAKE_ROOT]: ignores(UNRELIABLE),
  [SkillType.THROW_TEAM_MATE]: chooses("Plans team-mate throws."),
  [SkillType.TIMMM_BER]: ENGINE,
  [SkillType.TITCHY]: prices("Counted in dodge odds."),
  [SkillType.TRICKSTER]: ENGINE,
  [SkillType.UNCHANNELLED_FURY]: ignores(UNRELIABLE),
  [SkillType.UNSTEADY]: ENGINE,
};
