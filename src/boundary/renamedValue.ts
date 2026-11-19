export function renamedValue(
  value: unknown,
  renames: Readonly<Record<string, string>>
): unknown {
  if (typeof value !== "string") return value;
  return new Map(Object.entries(renames)).get(value) ?? value;
}
