import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@diamondlightsource/sci-react-ui/font-styles.css";
import { ThemeProvider } from "@diamondlightsource/sci-react-ui";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
