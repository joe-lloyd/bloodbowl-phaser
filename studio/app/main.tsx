import { createRoot } from "react-dom/client";
import "../../src/ui/styles/global.css";
import { StudioApp } from "./StudioApp";

document.documentElement.style.colorScheme = "dark";
document.body.className = "m-0 bg-hud-ink text-hud-bone font-hud-body";

const root = document.querySelector("#root");
if (root) createRoot(root).render(<StudioApp />);
