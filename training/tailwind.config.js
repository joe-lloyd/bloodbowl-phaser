import game from "../tailwind.config.js";

export default {
  ...game,
  content: ["./training/**/*.{html,ts,tsx}", "./src/ui/**/*.{ts,tsx}"],
};
