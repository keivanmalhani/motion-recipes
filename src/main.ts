import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/stages.css";

import { mountApp } from "./ui/app.ts";

const root = document.querySelector<HTMLElement>("#app");
if (root) mountApp(root);
