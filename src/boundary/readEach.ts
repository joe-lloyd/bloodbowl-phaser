export function readEach<Value, Item>(
  values: readonly Value[],
  read: (value: Value) => Item
): Item[] {
  return values.flatMap((value) => {
    try {
      return [read(value)];
    } catch (error) {
      console.warn("Skipped a stored document that failed validation", error);
      return [];
    }
  });
}
