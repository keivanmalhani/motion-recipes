import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the built site works from any sub-path,
  // including a GitHub Pages project URL.
  base: "./",
  build: {
    target: "es2022",
    cssMinify: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
