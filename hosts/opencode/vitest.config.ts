import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 10_000,
    isolate: true,
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
