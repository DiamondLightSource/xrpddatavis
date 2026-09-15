import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// sci-react-ui@0.7.0 (latest on npm) predates its own `font-styles.css`
// export - it exists on the package's main branch/docs but hasn't been
// published yet - so the three fonts it bundles (Inter, Outfit, IBM Plex
// Mono; see the Typography usage guidance in Practical Guidance) are
// imported directly here instead. Swap this back to the single
// `@diamondlightsource/sci-react-ui/font-styles.css` import once a release
// past 0.7.0 ships it.
import "@fontsource-variable/inter";
import "@fontsource-variable/outfit";
import "@fontsource/ibm-plex-mono";
import { ThemeProvider } from "@diamondlightsource/sci-react-ui";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
