import path from "node:path";
import base from "../tailwind.config.js";

const at = (glob) => path.resolve(import.meta.dirname, glob);

export default { ...base, content: [at("index.html"), at("app/**/*.tsx"), at("../src/ui/**/*.{ts,tsx}")] };
