import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "@paperplay/ui/fonts.css";
import "@paperplay/ui/components.css";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("PaperPlay needs a #root element to mount into");

// The first world is the home page for now.
if (window.location.pathname === "/") window.history.replaceState(null, "", "/world/local");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
