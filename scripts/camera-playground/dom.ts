export function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing playground element ${id}`);
  return found;
}
export function input(id: string): HTMLInputElement {
  const found = element(id);
  if (!(found instanceof HTMLInputElement))
    throw new Error(`Expected input ${id}`);
  return found;
}
