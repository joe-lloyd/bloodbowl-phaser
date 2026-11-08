/**
 * True while the focused element takes keys for itself: the coach typing,
 * when letters are words, not commands, or stepping through a menu.
 */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    !!target.closest('[role="menu"]') ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement &&
      !["button", "checkbox", "radio", "submit"].includes(target.type))
  );
}
