import type { DriftSpec, Fact } from "./driftSpec";

const size: Fact = { label: "Text size", measure: "fontSize" };
const fill: Fact = { label: "Fill", measure: "backgroundColor" };
const width: Fact = { label: "Width", measure: "width" };
const height: Fact = { label: "Height", measure: "height" };

const BANNERS: DriftSpec[] = [
  {
    id: "toasts",
    title: "Toasts",
    sentence:
      "A phone shows a notification as a toast. A desktop only writes it into the dice log, so it is easy to miss.",
    specimens: [
      {
        variant: "toast",
        label: "Phone toast",
        size: "phone",
        selector: '[data-testid="phone-notice"]',
      },
      {
        variant: "toast",
        label: "Desktop log entry",
        size: "desktop",
        selector: '[data-testid="dice-log"] .animate-push-down',
        contains: "out of reach",
      },
    ],
    facts: [width, height],
  },
  {
    id: "corner-buttons",
    title: "Corner buttons",
    sentence:
      "Match options and the phone corner buttons are raw buttons with hand-written styles, and none is a HudButton.",
    specimens: [
      {
        variant: "menu-none",
        label: "Match options",
        selector: '[aria-haspopup="menu"]',
      },
      {
        variant: "menu-none",
        label: "Phone log button",
        size: "phone",
        selector: '[data-testid="dice-log-toggle"]',
      },
      {
        variant: "block-buttons",
        label: "HudButton, medium",
        selector: "button",
        contains: "md",
      },
    ],
    facts: [height, size, fill],
  },
];

export const DRIFT: readonly DriftSpec[] = [...BANNERS];
