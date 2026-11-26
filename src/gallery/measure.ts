import type { Fact, Specimen } from "./driftSpec";

const STYLED = [
  "fontSize",
  "color",
  "backgroundColor",
  "padding",
  "letterSpacing",
] as const;

const hex = (value: string) => {
  const parts = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value);
  return parts
    ? `#${parts
        .slice(1)
        .map((part) => Number(part).toString(16).padStart(2, "0"))
        .join("")}`
    : value;
};

export function findSpecimen(
  page: Document | null | undefined,
  { selector, contains }: Specimen
): Element | undefined {
  return [...(page?.querySelectorAll(selector) ?? [])].find(
    (element) =>
      element.getBoundingClientRect().width > 0 &&
      (contains === undefined || element.textContent.includes(contains))
  );
}

export function bringIntoView(element: Element): void {
  const page = element.ownerDocument;
  const view = page.defaultView;
  const { top, bottom } = element.getBoundingClientRect();
  if (!view || (top >= 0 && bottom <= view.innerHeight)) return;
  let scroller = element.parentElement;
  while (
    scroller &&
    !/auto|scroll/.test(view.getComputedStyle(scroller).overflowY)
  )
    scroller = scroller.parentElement;
  (scroller ?? page.documentElement).scrollTop += top - 120;
}

export function readFact(specimen: Element, fact: Fact): string {
  const element = fact.selector
    ? specimen.querySelector(fact.selector)
    : specimen;
  const view = specimen.ownerDocument.defaultView;
  if (!element || !view) return "none";
  const style = view.getComputedStyle(element);
  const { measure } = fact;
  if (measure === "fontFamily")
    return style.fontFamily.split(",", 1)[0]?.replaceAll('"', "") ?? "none";
  const styled = STYLED.find((name) => name === measure);
  if (styled) return hex(style[styled]);
  const box = element.getBoundingClientRect();
  return `${String(Math.round(measure === "width" ? box.width : box.height))}px`;
}
