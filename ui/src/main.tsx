import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LANG } from "./lib/i18n";
import "./index.css";

document.documentElement.lang = LANG;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
