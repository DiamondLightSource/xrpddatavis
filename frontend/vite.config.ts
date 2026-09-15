import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds straight into the Python package's static/ directory, so the
// FastAPI server (xrpddatavis.server) can keep serving it from the same
// place the previous hand-written JS/CSS lived - see ../src/xrpddatavis/server.py.
export default defineConfig({
  plugins: [react()],
  base: "/static/",
  build: {
    outDir: "../src/xrpddatavis/static",
    emptyOutDir: true,
  },
  server: {
    // proxy API calls to a locally running `xrpddatavis serve` during `npm run dev`
    proxy: {
      "/plot": "http://localhost:8000",
      "/liveplots": "http://localhost:8000",
      "/remove": "http://localhost:8000",
      "/edit": "http://localhost:8000",
      "/plots": "http://localhost:8000",
      "/events": "http://localhost:8000",
      "/limits": "http://localhost:8000",
      "/info": "http://localhost:8000",
      "/healthz": "http://localhost:8000",
    },
  },
});
