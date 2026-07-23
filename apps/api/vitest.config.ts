import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Not every app slice has tests; do not fail the run when a filter matches none.
    passWithNoTests: true,
  },
});
