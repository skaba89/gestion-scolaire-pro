import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // .claude/worktrees/** holds separate git worktrees for background
    // agent tasks — each is a full nested copy of this repo (own
    // node_modules, own tests/). Without this exclusion, running the suite
    // while a background task's worktree exists picks up ITS test files
    // too (mid-edit, sometimes deliberately broken) and reports them as
    // failures in THIS run, even though they have nothing to do with the
    // current working tree's changes.
    exclude: [...configDefaults.exclude, "tests/e2e/**", ".claude/worktrees/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "coverage/",
        "**/*.d.ts",
        "**/index.ts",
        "src/main.tsx",
      ],
      thresholds: {
        lines: 25,
        functions: 25,
        branches: 20,
        statements: 25,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
