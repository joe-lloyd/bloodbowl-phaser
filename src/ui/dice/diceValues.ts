export function indexed<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined)
    throw new Error(`Invalid dice index: ${String(index)}`);
  return value;
}
