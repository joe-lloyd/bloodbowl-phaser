type IgnoreResult<Method> = Method extends (...args: infer Arguments) => unknown
  ? (...args: Arguments) => unknown
  : never;

export type Commands<Methods> = { [Name in keyof Methods]: IgnoreResult<Methods[Name]> };
