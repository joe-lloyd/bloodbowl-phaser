import type { ComponentProps } from "react";

export function Link(props: ComponentProps<"a">) {
  return <a {...props} />;
}

export function Button(props: ComponentProps<"button">) {
  return <button {...props} />;
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} />;
}
