import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Financial-month logic assumes Europe/Paris local time (see src/lib/format.ts);
    // pin it so the suite is deterministic regardless of the host's TZ.
    env: {
      TZ: "Europe/Paris",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
