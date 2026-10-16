import { defineConfig } from "vitest/config";
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
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // main.tsx only mounts <App /> into the page
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/test/**", "src/main.tsx"],
      // lcov is what the CI Codecov upload reads (.github/workflows/_test.yml)
      reporter: ["text", "lcov"],
    },
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
