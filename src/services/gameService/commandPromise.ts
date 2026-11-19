export function invokeCommand<Value>(command: () => Value): Promise<Value> {
  return new Promise((resolve) => {
    resolve(command());
  });
}
