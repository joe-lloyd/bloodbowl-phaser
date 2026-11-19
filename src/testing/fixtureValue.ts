export function fixtureValue<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Missing test fixture value");
  }
  return value;
}
