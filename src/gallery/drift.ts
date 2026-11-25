import type { DriftSpec, Fact, Specimen } from "./driftSpec";

const SETUP = '[data-testid="setup-controls"]';
const KICKOFF = "section.hud-slab";
const PAGE = ".hud-page";

const font: Fact = { label: "Font", measure: "fontFamily" };
const size: Fact = { label: "Text size", measure: "fontSize" };
const colour: Fact = { label: "Text colour", measure: "color" };
const fill: Fact = { label: "Fill", measure: "backgroundColor" };
const width: Fact = { label: "Width", measure: "width" };
const height: Fact = { label: "Height", measure: "height" };

const kickoffPanel: Specimen = {
  variant: "kickoff-step-move",
  label: "Kick-off step",
  selector: KICKOFF,
  contains: "Alert Defence",
};

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

const PAGES: DriftSpec[] = [
  {
    id: "card-titles",
    title: "Card titles on pages",
    sentence:
      "A card names a team or a league with a different font and size on each page.",
    specimens: [
      {
        variant: "page-teams",
        label: "Teams",
        selector: "h3",
        contains: "Founders",
      },
      {
        variant: "page-shared",
        label: "Other coaches",
        selector: "h2",
        contains: "Founders",
      },
      {
        variant: "page-clubs",
        label: "Clubs",
        selector: "button > span",
        contains: "Founders",
      },
      {
        variant: "page-leagues",
        label: "Leagues",
        selector: "button > span",
        contains: "League",
      },
      {
        variant: "page-league",
        label: "A league's teams",
        selector: "h3",
        contains: "Founders",
      },
    ],
    facts: [font, size],
  },
  {
    id: "section-titles",
    title: "Section titles on pages",
    sentence:
      "A section heading is a panel header on most pages, a small gold label in the lobby and large gold text after a match.",
    specimens: [
      {
        variant: "page-friends",
        label: "Friends",
        selector: `${PAGE} h2`,
      },
      {
        variant: "page-join",
        label: "Join a game",
        selector: "h2",
        contains: "Open games",
      },
      {
        variant: "page-league-active",
        label: "A league round",
        selector: "h3",
        contains: "Round",
      },
      {
        variant: "results-progression",
        label: "Full time",
        selector: "h2",
        contains: "MVP",
      },
    ],
    facts: [font, size, colour],
  },
  {
    id: "small-text",
    title: "Small sentences",
    sentence:
      "The two smallest text sizes carry wide letter spacing meant for caps labels, so whole sentences in them look stretched next to the size above.",
    specimens: [
      {
        variant: "block-defender",
        label: "Block preview",
        selector: '[data-testid="block-roll-analysis"] > div',
      },
      { ...kickoffPanel, selector: "ol", contains: "Choose" },
    ],
    facts: [size, { label: "Letter spacing", measure: "letterSpacing" }],
  },
  {
    id: "form-controls",
    title: "Form controls",
    sentence:
      "A field is shorter than the button beside it on pages, matches it in the setup menu and is much taller for a match code.",
    specimens: [
      {
        variant: "setup-incomplete",
        label: "Save a formation on desktop",
        size: "desktop",
        selector: `${SETUP} input`,
      },
      {
        variant: "setup-incomplete",
        label: "Its button",
        size: "desktop",
        selector: `${SETUP} button`,
        contains: "SAVE",
      },
      {
        variant: "page-league-signup",
        label: "Enter a league",
        selector: "select",
      },
      {
        variant: "page-league-signup",
        label: "Its button",
        selector: "button",
        contains: "Enter team",
      },
      {
        variant: "page-join",
        label: "Match code",
        selector: "input",
      },
    ],
    facts: [height, size, font],
  },
];

export const DRIFT: readonly DriftSpec[] = [
  ...BANNERS,
  ...PAGES,
];
