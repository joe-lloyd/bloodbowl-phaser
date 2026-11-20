import type { KeyboardEvent } from "react";

const STEPS: Partial<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

export function choiceKeys<T extends string>({
  ids,
  value,
  onChange,
}: {
  ids: readonly T[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (id: T) => ({
    tabIndex: id === value ? 0 : -1,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const step = STEPS[event.key];
      if (step === undefined) return;
      event.preventDefault();
      const index = (ids.indexOf(id) + step + ids.length) % ids.length;
      const next = ids[index];
      if (next === undefined) return;
      onChange(next);
      const sibling = event.currentTarget.parentElement?.children[index];
      if (sibling instanceof HTMLElement) sibling.focus();
    },
  });
}
