class FrameStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length() {
    return this.items.size;
  }

  clear() {
    this.items.clear();
  }

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.items.delete(key);
  }

  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

const touchQuery = (query: string) =>
  query
    .replaceAll(/\(\s*pointer:\s*coarse\s*\)/g, "(min-width: 0px)")
    .replaceAll(/\(\s*pointer:\s*fine\s*\)/g, "(max-width: 0px)");

function touchRules(rules: CSSRuleList): void {
  for (const rule of rules) {
    if (!(rule instanceof CSSMediaRule)) {
      continue;
    }

    rule.media.mediaText = touchQuery(rule.media.mediaText);
    touchRules(rule.cssRules);
  }
}

export function touchStyles(): void {
  for (const sheet of document.styleSheets) {
    const own = !sheet.href || sheet.href.startsWith(window.location.origin);
    if (own) touchRules(sheet.cssRules);
  }
}

export const frame = new URLSearchParams(window.location.search);

function isolateFrame(): void {
  for (const name of ["localStorage", "sessionStorage"])
    Object.defineProperty(window, name, { value: new FrameStorage() });
  if (frame.get("size") !== "phone") return;
  const real = window.matchMedia.bind(window);
  window.matchMedia = (query) => real(touchQuery(query));
}

if (frame.has("v")) isolateFrame();
