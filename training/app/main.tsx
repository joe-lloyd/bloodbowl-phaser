import { createRoot } from "react-dom/client";
import "../../src/ui/styles/global.css";
import { TrainingApp } from "./TrainingApp";

document.documentElement.style.colorScheme = "dark";
document.body.className = "m-0 bg-hud-ink font-hud-body text-hud-bone";

const root = document.querySelector("#root");
if (root) createRoot(root).render(<TrainingApp />);
