import type React from "react";

export function MoveSplit({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="move-split"
      className="flex w-full gap-px [&>button]:min-w-0 [&>button]:flex-1 [&>button:first-child]:rounded-r-none [&>button:last-child]:rounded-l-none"
    >
      {children}
    </div>
  );
}
