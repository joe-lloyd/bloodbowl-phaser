import { actionTypeSchema } from "../boundary/schemas/ActionType";
import type { HeadlessCommand } from "./protocol";

export function currentCommand(command: HeadlessCommand): HeadlessCommand {
  if (command.type !== "declare-action") return command;
  const action = actionTypeSchema.safeParse(command.action);
  return !action.success || action.data === command.action
    ? command
    : { ...command, action: action.data };
}
