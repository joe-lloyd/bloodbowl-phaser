import type { HeadlessCommand } from "../headless/protocol";

export function isCommandOf<const Type extends HeadlessCommand["type"]>(
  command: HeadlessCommand,
  types: readonly Type[]
): command is Extract<HeadlessCommand, { type: Type }> {
  return types.some((type) => type === command.type);
}
