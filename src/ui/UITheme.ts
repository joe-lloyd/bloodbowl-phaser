/**
 * UITheme - Central theme configuration for all UI elements
 * Ensures consistent styling across the entire game
 */

export const UITheme = {
  // Color Palette
  colors: {
    // Primary colors
    primary: "#4444ff",
    secondary: "#ff4444",

    // Status colors
    success: "#44ff44",
    danger: "#ff4444",
    warning: "#ffaa00",
    info: "#4444ff",

    // Neutral colors
    background: "#1a1a2e",
    backgroundDark: "#0a0a1e",
    surface: "#222222",
    border: "#444444",

    // Text colors
    textPrimary: "#ffffff",
    textSecondary: "#aaaaaa",
    textDisabled: "#666666",

    // Accent colors
    accent: "#ffff44",
    highlight: "#ffff00",
  },

  // Typography
  typography: {
    // Font families
    fontFamily: "Arial, sans-serif",

    // Font sizes
    fontSize: {
      h1: "48px",
      h2: "36px",
      h3: "32px",
      h4: "24px",
      h5: "20px",
      h6: "18px",
      body: "16px",
      small: "14px",
      tiny: "12px",
      button: "20px",
      buttonLarge: "32px",
      buttonSmall: "11px",
    },
  },

  // Spacing
  spacing: {
    xs: 5,
    sm: 10,
    md: 15,
    lg: 20,
    xl: 30,
  },

  // Button styles
  button: {
    primary: {
      color: "#44ff44",
      backgroundColor: "#222222",
      hoverColor: "#ffffff",
      hoverBackgroundColor: "#44ff44",
      padding: { x: 20, y: 10 },
    },
    secondary: {
      color: "#4444ff",
      backgroundColor: "#222222",
      hoverColor: "#ffffff",
      hoverBackgroundColor: "#4444ff",
      padding: { x: 20, y: 10 },
    },
    danger: {
      color: "#ff4444",
      backgroundColor: "#222222",
      hoverColor: "#ffffff",
      hoverBackgroundColor: "#ff4444",
      padding: { x: 20, y: 10 },
    },
    success: {
      color: "#44ff44",
      backgroundColor: "#222222",
      hoverColor: "#ffffff",
      hoverBackgroundColor: "#44ff44",
      padding: { x: 20, y: 10 },
    },
    warning: {
      color: "#ffaa00",
      backgroundColor: "#222222",
      hoverColor: "#ffffff",
      hoverBackgroundColor: "#ffaa00",
      padding: { x: 20, y: 10 },
    },
    large: {
      color: "#44ff44",
      backgroundColor: "#222222",
      hoverColor: "#ffffff",
      hoverBackgroundColor: "#44ff44",
      padding: { x: 30, y: 15 },
    },
    small: {
      color: "#44ff44",
      backgroundColor: "#222222",
      hoverColor: "#ffffff",
      hoverBackgroundColor: "#44ff44",
      padding: { x: 8, y: 4 },
    },
  },

  // Panel styles
  panel: {
    backgroundColor: 0x1a1a2e,
    borderColor: 0x444444,
    opacity: 0.8,
  },

  // Overlay styles
  overlay: {
    backgroundColor: 0x000000,
    opacity: 0.7,
  },
} as const;

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "success"
  | "warning"
  | "large"
  | "small";
export type TextVariant =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "body"
  | "small"
  | "tiny";
