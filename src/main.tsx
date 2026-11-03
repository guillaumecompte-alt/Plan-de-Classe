import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";

const root = document.getElementById("root");
if (!root) throw new Error("Élément #root introuvable dans index.html");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
