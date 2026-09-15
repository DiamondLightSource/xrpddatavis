import type * as PlotlyJS from "plotly.js";

// Plotly is loaded as a <script> global from cdnjs (see index.html) rather
// than bundled, so it is typed here without importing the actual package.
declare global {
  interface Window {
    Plotly?: typeof PlotlyJS;
  }
}
