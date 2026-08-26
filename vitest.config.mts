import { defineConfig } from "vitest/config";

/**
 * Phase 3 of the QA plan (docs/qa/qa-plan.md): a pure-logic unit suite.
 *
 * Node environment, no setup file — these tests import model functions that
 * touch neither the DB nor the DOM. `resolve.tsconfigPaths` makes Vite honour
 * the `@/*` aliases from tsconfig, so a test imports a module by the exact path
 * production does. `.mts` so the config is loaded as ESM without a warning.
 *
 * Tests live under `tests/` rather than co-located so the architectural checks
 * (which scan `src/`) never see a file that imports across domain boundaries.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
