import type { DriftSpec, Fact, Specimen } from "./driftSpec";

const SETUP = '[data-testid="setup-controls"]';
const KICKOFF = "section.hud-slab";
const MENU = '[data-testid="player-action-menu"]';
const PLAN = '[data-testid="action-plan"]';
const END_TURN = '[data-testid="end-turn"]';
const PAGE = ".hud-page";
const DIALOG = "[data-hotkey-scope] > .hud-slab";

const HEADING =
  "h2, [data-panel-header] > :first-child, :scope > .hud-label:not(:has(+ h2))";

const font: Fact = { label: "Font", measure: "fontFamily" };
const size: Fact = { label: "Text size", measure: "fontSize" };
const colour: Fact = { label: "Text colour", measure: "color" };
const fill: Fact = { label: "Fill", measure: "backgroundColor" };
const width: Fact = { label: "Width", measure: "width" };
const height: Fact = { label: "Height", measure: "height" };
const padding: Fact = { label: "Padding", measure: "padding" };

const kickoffPanel: Specimen = {
  variant: "kickoff-step-move",
  label: "Kick-off step",
  selector: KICKOFF,
  contains: "Alert Defence",
};
const sequence: Specimen = {
  variant: "menu-sequence-second",
  label: "Action sequence",
  selector: MENU,
};
const plan: Specimen = {
  variant: "action-plan-blitz",
  label: "Action plan",
  selector: PLAN,
};
const setup: Specimen = {
  variant: "setup-checklist",
  label: "Setup menu",
  selector: SETUP,
};
const docked: Specimen = {
  variant: "reaction",
  label: "Docked dialog",
  selector: "[data-decision-dialog] > .hud-slab",
};

const PANELS: DriftSpec[] = [
  {
    id: "panel-headings",
    title: "Right-hand panel headings",
    sentence:
      "Five panels take turns in the right-hand column, and each has its own heading.",
    specimens: [kickoffPanel, setup, sequence, plan, docked],
    facts: [
      {
        label: "Heading size",
        measure: "fontSize",
        selector: HEADING,
      },
      {
        label: "Heading colour",
        measure: "color",
        selector: HEADING,
      },
    ],
  },
  {
    id: "step-lists",
    title: "Lists of steps",
    sentence:
      "The game explains a sequence of steps in four ways, from tall numbered buttons to small lines with a ring.",
    specimens: [
      { ...kickoffPanel, selector: "ol", contains: "Choose" },
      {
        ...sequence,
        selector: `${MENU} div:has(> [data-testid^="action-step-"])`,
      },
      {
        ...plan,
        label: "Action plan on desktop",
        size: "desktop",
        selector: `${PLAN} ol`,
      },
      { ...setup, selector: '[data-testid="setup-checklist"]' },
    ],
    facts: [
      size,
      font,
      { label: "Row height", measure: "height", selector: "li, button" },
    ],
  },
  {
    id: "panel-padding",
    title: "Panel padding",
    sentence:
      "The body padding changes from panel to panel, so text does not line up as they replace each other.",
    specimens: [kickoffPanel, plan, docked],
    facts: [padding, width],
  },
  {
    id: "dock-buttons",
    title: "Main button in the right-hand column",
    sentence:
      "The button that moves the turn on runs from 32 to 56 pixels tall. End Turn also asks for the display font but a later class gives it the label font.",
    specimens: [
      {
        ...kickoffPanel,
        variant: "kickoff-step-start",
        selector: "section.hud-slab button",
        contains: "Start",
      },
      {
        ...docked,
        selector: '[data-testid="reaction-yes"]',
      },
      {
        ...plan,
        selector: '[data-testid="action-plan-go"]',
      },
      {
        ...setup,
        variant: "setup-ready",
        selector: `${SETUP} button`,
        contains: "CONFIRM",
      },
      {
        ...sequence,
        label: "End activation",
        selector: '[data-testid="action-end-activation"]',
      },
      {
        ...sequence,
        label: "End turn",
        selector: END_TURN,
      },
    ],
    facts: [height, width, size, font, fill],
  },
  {
    id: "end-button-names",
    title: "End button with a long name",
    sentence:
      "End Alert Defence wraps to two lines on a desktop, and a phone cuts off both ends of it because the button is sized for End Turn.",
    specimens: [
      {
        variant: "menu-none",
        label: "A normal turn",
        selector: END_TURN,
      },
      {
        variant: "kickoff-charge-play",
        label: "Charge",
        selector: END_TURN,
      },
      {
        variant: "kickoff-step-move",
        label: "Alert Defence",
        selector: END_TURN,
      },
    ],
    facts: [width, height, size],
  },
  {
    id: "block-dialog-buttons",
    title: "Block buttons in a narrow dock",
    sentence:
      "The Block dialog asks for a large button, which wraps to two lines on a desktop and runs past the panel edge, while the other docked dialogs use the medium size.",
    specimens: [
      {
        variant: "block-2",
        label: "Block",
        selector: "[data-decision-dialog] > .hud-slab",
      },
      { ...docked, variant: "follow-up", label: "Follow up" },
    ],
    facts: [
      {
        label: "Last button height",
        measure: "height",
        selector: "button:last-of-type",
      },
      {
        label: "Last button text",
        measure: "fontSize",
        selector: "button:last-of-type",
      },
    ],
  },
];

const OPENING: DriftSpec[] = [
  {
    id: "opening-containers",
    title: "Steps before the first turn",
    sentence:
      "On a desktop, weather, the coin toss and the kick-off table share one strip. Inducements come in the same sequence but are a centred dialog with a larger heading.",
    specimens: [
      {
        variant: "inducement-panel",
        label: "Inducements",
        selector: DIALOG,
      },
      {
        variant: "weather-waiting",
        label: "Weather",
        selector: '[data-testid="weather-dialog"] > .hud-slab',
      },
      { variant: "coin-start", label: "Coin toss", selector: DIALOG },
      {
        variant: "kickoff-table",
        label: "Kick-off table",
        selector: '[data-testid="kickoff-table-dialog"] > .hud-slab',
      },
    ],
    facts: [
      width,
      {
        label: "Heading size",
        measure: "fontSize",
        selector: "h1, h2, [data-panel-header] > :first-child",
      },
    ],
  },
  {
    id: "dialog-widths",
    title: "Centred dialog widths",
    sentence:
      "Centred dialogs pick their own width. The source has seven widths between 400 and 600 pixels, and some belong to dialogs that now sit in the dock and ignore them.",
    specimens: [
      { variant: "page-sign-in", label: "Sign in", selector: DIALOG },
      {
        variant: "inducement-panel",
        label: "Inducements",
        selector: DIALOG,
      },
    ],
    facts: [width, padding],
  },
  {
    id: "waiting-lines",
    title: "Waiting for the other coach",
    sentence:
      "The same message is a large label in the opening rolls, plain text in the kick-off step and a gold banner during a turn.",
    specimens: [
      {
        variant: "weather-online-waiting",
        label: "Weather",
        selector: "p",
        contains: "Waiting",
      },
      {
        variant: "kickoff-waiting",
        label: "Kick-off step",
        selector: "p",
        contains: "Waiting",
      },
      {
        variant: "waiting-banner",
        label: "During a turn",
        selector: '[data-testid="waiting-banner"]',
      },
    ],
    facts: [font, size, colour],
  },
];

const BANNERS: DriftSpec[] = [
  {
    id: "notices",
    title: "Short notices over the pitch",
    sentence:
      "Three notices share one place under the score, each with its own padding, edge and text style.",
    specimens: [
      {
        variant: "waiting-banner",
        label: "Waiting",
        selector: '[data-testid="waiting-banner"]',
      },
      {
        variant: "refusal-notice",
        label: "Refused click",
        selector: '[data-testid="refusal-notice"]',
      },
      {
        variant: "connection-slow",
        label: "Connection",
        selector: '[data-testid="connection-banner"]',
      },
    ],
    facts: [padding, size, font, height],
  },
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
    id: "big-banners",
    title: "Big result banners",
    sentence:
      "Announcements, roll results and turnovers each pick their own headline size, and the turnover is also red and tilted.",
    specimens: [
      {
        variant: "announce-touchdown",
        label: "Announcement",
        selector: '[data-testid="announcement"] > div',
      },
      {
        variant: "banner-armour",
        label: "Roll result",
        selector: '[data-testid="roll-banner"]',
      },
      {
        variant: "turnover",
        label: "Turnover",
        selector: '[data-testid="turnover-moment"] > div',
      },
    ],
    facts: [
      {
        label: "Headline size",
        measure: "fontSize",
        selector: "h1, span, p",
      },
      height,
    ],
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
    id: "picked-choice",
    title: "A picked choice",
    sentence:
      "A picked choice glows gold everywhere except the MVP list, which turns it red.",
    specimens: [
      {
        variant: "page-select",
        label: "Team selection",
        selector: '[aria-checked="true"]',
      },
      {
        variant: "results-progression",
        label: "MVP nominee",
        selector: "section button",
        contains: "1. #",
      },
      {
        variant: "block-forms",
        label: "The shared choice",
        selector: '[aria-pressed="true"]',
      },
    ],
    facts: [fill, size, height],
  },
  {
    id: "body-text",
    title: "Body text colour",
    sentence:
      "Dialog and notice text uses a one-off cream that is not in the palette, while other text uses bone or dim.",
    specimens: [
      {
        variant: "reaction",
        label: "Dialog text",
        selector: "[data-decision-dialog] p",
      },
      {
        variant: "kickoff-waiting",
        label: "Kick-off text",
        selector: "p",
        contains: "Waiting",
      },
      {
        variant: "block-bits",
        label: "Empty state text",
        selector: "div.mt-2",
        contains: "An empty list",
      },
    ],
    facts: [colour, size],
  },
  {
    id: "small-text",
    title: "Small sentences",
    sentence:
      "The two smallest text sizes carry wide letter spacing meant for caps labels, so whole sentences in them look stretched next to the size above.",
    specimens: [
      {
        variant: "block-2",
        label: "Block preview",
        selector: '[data-testid="block-roll-analysis"]',
      },
      {
        variant: "setup-checklist",
        label: "Setup rules",
        selector: '[data-testid="setup-checklist"]',
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
  ...PANELS,
  ...OPENING,
  ...BANNERS,
  ...PAGES,
];
