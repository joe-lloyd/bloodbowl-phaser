/**
 * UITheme - Color palette and typography for Phaser UI elements
 * Optimized for Blood Bowl 2025 styling
 */

export const UITheme = {
  // Blood Bowl 2025 Color Palette
  colors: {
    // Primary Colors
    bloodRed: 0x8E1B1B,
    deepCrimson: 0xB32020,
    inkBlue: 0x1E3A5F,

    // Secondary Colors
    parchment: 0xF3E9D2,
    warmPaper: 0xE8DDC4,

    // Accent Colors
    gold: 0xD6B25E,
    darkGold: 0xB59645,
    pitchGreen: 0x556B2F,

    // Utility Colors
    textDark: 0x2A1F1A,
    mutedText: 0x6B5E54,
    divider: 0xC7B89A,
    error: 0x9C1C1C,
    success: 0x3E6B2F,

    surface: 0xE8DDC4,
    textDisabled: 0x6B5E54,

    // Legacy/Mapped properties for compatibility
    primary: 0x8E1B1B,
    secondary: 0x1E3A5F,
    textPrimary: 0x2A1F1A, // Dark text on parchment
    textSecondary: 0x6B5E54,
    background: 0xF3E9D2,
  },

  // String versions for CSS/HTML contexts
  colorsHex: {
    bloodRed: "#8E1B1B",
    deepCrimson: "#B32020",
    inkBlue: "#1E3A5F",
    parchment: "#F3E9D2",
    warmPaper: "#E8DDC4",
    gold: "#D6B25E",
    darkGold: "#B59645",
    pitchGreen: "#556B2F",
    textDark: "#2A1F1A",
    mutedText: "#6B5E54",
    divider: "#C7B89A",
    error: "#9C1C1C",
    success: "#3E6B2F",
  },

  // Typography for Phaser Text Objects
  typography: {
    fontFamily: "Oswald, Impact, sans-serif",
    fontSize: {
      h1: "48px",
      h2: "36px",
      h3: "24px",
      h4: "20px",
      body: "16px",
      small: "14px",
      tiny: "12px",
      button: "20px",
      buttonLarge: "32px",
      buttonSmall: "11px",
    }
  },

  // Button Styles for Phaser UI Buttons
  button: {
    primary: {
      color: "#F3E9D2", // Parchment
      backgroundColor: "#8E1B1B", // Blood Red
      hoverColor: "#FFFFFF",
      hoverBackgroundColor: "#B32020", // Deep Crimson
      padding: { x: 20, y: 10 },
    },
    secondary: {
      color: "#F3E9D2",
      backgroundColor: "#1E3A5F", // Ink Blue
      hoverColor: "#FFFFFF",
      hoverBackgroundColor: "#2A4B75",
      padding: { x: 20, y: 10 },
    },
    danger: {
      color: "#F3E9D2",
      backgroundColor: "#9C1C1C", // Error
      hoverColor: "#FFFFFF",
      hoverBackgroundColor: "#8E1B1B",
      padding: { x: 20, y: 10 },
    },
    success: {
      color: "#F3E9D2",
      backgroundColor: "#3E6B2F", // Success
      hoverColor: "#FFFFFF",
      hoverBackgroundColor: "#556B2F",
      padding: { x: 20, y: 10 },
    },
    warning: {
      color: "#2A1F1A",
      backgroundColor: "#D6B25E", // Gold
      hoverColor: "#000000",
      hoverBackgroundColor: "#B59645",
      padding: { x: 20, y: 10 },
    },
    large: {
      color: "#F3E9D2",
      backgroundColor: "#8E1B1B",
      hoverColor: "#FFFFFF",
      hoverBackgroundColor: "#B32020",
      padding: { x: 30, y: 15 },
    },
    small: {
      color: "#F3E9D2",
      backgroundColor: "#1E3A5F",
      hoverColor: "#FFFFFF",
      hoverBackgroundColor: "#2A4B75",
      padding: { x: 8, y: 4 },
    },
  },

  // Overlay Styles
  overlay: {
    backgroundColor: 0x000000,
    opacity: 0.7,
  },

} as const;

export type ButtonVariant = keyof typeof UITheme.button;
export type TextVariant = keyof typeof UITheme.typography.fontSize;
