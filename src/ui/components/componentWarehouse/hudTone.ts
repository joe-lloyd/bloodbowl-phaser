/** Class joining and the tone colours the rest of the kit shares. */
export const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/** Accent colours shared by panels, chips and log rows. */
export type HudTone =
  | "gold"
  | "blood"
  | "good"
  | "bad"
  | "warn"
  | "info"
  | "skill"
  | "neutral";

const TONE_TEXT: Record<HudTone, string> = {
  gold: "text-hud-gold",
  blood: "text-hud-blood-hot",
  good: "text-hud-good",
  bad: "text-hud-bad",
  warn: "text-hud-warn",
  info: "text-hud-info",
  skill: "text-hud-skill",
  neutral: "text-hud-dim",
};

const TONE_BAR: Record<HudTone, string> = {
  gold: "bg-hud-gold",
  blood: "bg-gradient-to-r from-hud-blood to-hud-gold",
  good: "bg-hud-good",
  bad: "bg-hud-bad",
  warn: "bg-hud-warn",
  info: "bg-hud-info",
  skill: "bg-hud-skill",
  neutral: "bg-hud-edge",
};

export const toneText = (tone: HudTone) => TONE_TEXT[tone];
export const toneBar = (tone: HudTone) => TONE_BAR[tone];
