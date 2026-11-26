export type Parsed<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly problems: readonly string[] };

export function found<Value>(value: Value): Parsed<Value> {
  return { ok: true, value };
}

export function missing<Value>(problem: string): Parsed<Value> {
  return { ok: false, problems: [problem] };
}

export function problemsOf(results: readonly Parsed<unknown>[]): string[] {
  return results.flatMap((result) => (result.ok ? [] : result.problems));
}

export function letters(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}
