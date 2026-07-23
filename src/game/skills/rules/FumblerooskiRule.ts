import { SkillRule } from "../SkillRule";

/**
 * Fumblerooski is executed by GameService.dropBallWithFumblerooski. It has
 * no roll hook: the coach chooses a square vacated during the active Move,
 * and the service validates and places the ball without causing a Turnover.
 */
export const FumblerooskiRule: SkillRule = {};
