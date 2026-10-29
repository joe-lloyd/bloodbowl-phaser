/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./gallery/index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Stadium Broadcast", the match HUD and every page around it: dark
        // slabs, gold hairlines, blood red for the thing that matters. Dark only.
        hud: {
          ink: "#0c0d10",
          sunk: "#08090b",
          slab: "#15171c",
          raise: "#1f222a",
          edge: "#2c3039",
          gold: "#e3b448",
          "gold-deep": "#9c7a2e",
          blood: "#b8141d",
          "blood-hot": "#d72631",
          "blood-deep": "#5c0a0e",
          bone: "#f1ebdd",
          dim: "#a39b8c",
          mute: "#6f685e",
          good: "#4fb35c",
          bad: "#e0453a",
          warn: "#e8a33a",
          info: "#5aa0d8",
          skill: "#a97be0",
        },
      },
      fontFamily: {
        "hud-display": ["Anton", "Oswald", "Impact", "sans-serif"],
        "hud-label": ["Barlow Condensed", "Oswald", "sans-serif"],
        "hud-body": ["Barlow", "system-ui", "sans-serif"],
      },
      fontSize: {
        "hud-2xs": ["10px", { lineHeight: "12px", letterSpacing: "0.12em" }],
        "hud-xs": ["11px", { lineHeight: "14px", letterSpacing: "0.12em" }],
        "hud-sm": ["13px", { lineHeight: "18px" }],
        "hud-base": ["15px", { lineHeight: "22px" }],
        "hud-lg": ["18px", { lineHeight: "22px" }],
        "hud-xl": ["24px", { lineHeight: "26px" }],
        "hud-2xl": ["30px", { lineHeight: "32px" }],
        "hud-3xl": ["40px", { lineHeight: "40px" }],
        "hud-4xl": ["64px", { lineHeight: "60px" }],
      },
      borderRadius: {
        hud: "3px",
      },
      spacing: {
        xs: "8px",
        sm: "16px",
        md: "24px",
        lg: "32px",
        xl: "48px",
        xxl: "64px",
      },
      boxShadow: {
        hud: "0 16px 40px -16px rgba(0,0,0,0.95), 0 2px 0 rgba(0,0,0,0.4)",
        "hud-press-blood": "0 3px 0 #5c0a0e",
        "hud-press-gold": "0 3px 0 #6b531c",
        "hud-press-dark": "0 3px 0 #000000",
        "hud-glow": "0 0 0 1px rgba(227,180,72,0.7), 0 0 20px rgba(227,180,72,0.25)",
      },
      transitionTimingFunction: {
        bb: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      keyframes: {
        "hud-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "hud-pop": {
          "0%": { opacity: "0", transform: "translateY(-8px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "hud-slam": {
          "0%": { opacity: "0", transform: "scale(1.35)" },
          "12%": { opacity: "1", transform: "scale(0.96)" },
          "20%": { transform: "scale(1)" },
          "85%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(1.04)" },
        },
      },
      animation: {
        "hud-in": "hud-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "hud-pop": "hud-pop 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "hud-slam": "hud-slam 2500ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
      },
    },
  },
  plugins: [],
};
