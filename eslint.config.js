import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", ".expo", "dev-dist", "android", "ios"] },

  // ─── Configuration principale : fichiers navigateur TS/TSX ───────────────
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // TypeScript gère les variables non définies — no-undef est redondant
      // (recommandation officielle typescript-eslint)
      "no-undef": "off",
      // Variables non utilisées : warn (migration progressive)
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }],
      // any explicite : warn (migration progressive)
      "@typescript-eslint/no-explicit-any": "warn",
      // console.log : warn (console.warn/error autorisés)
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // require() dans les fichiers TS (tailwind, vite, etc.) : warn
      "@typescript-eslint/no-require-imports": "warn",
    },
  },

  // ─── Fichiers de configuration Node.js ────────────────────────────────────
  // vite.config.ts, vitest.config.ts, tailwind.config.ts, postcss.config.js
  {
    files: [
      "vite.config.ts",
      "vitest.config.ts",
      "tailwind.config.{ts,js,cjs}",
      "postcss.config.{js,cjs,ts}",
      "playwright.config.ts",
      "capacitor.config.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Les fichiers de config Node.js utilisent require(), __dirname, etc.
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
    },
  },

  // ─── Fichiers de tests Vitest ─────────────────────────────────────────────
  {
    files: [
      "vitest.setup.ts",
      "src/**/*.{test,spec}.{ts,tsx}",
      "src/test/**/*.{ts,tsx}",
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Globaux Vitest (injectés via globals: true dans vitest.config.ts)
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly",
        suite: "readonly",
        // global est disponible dans l'environnement jsdom de Vitest
        global: "writable",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },

  // ─── Tests E2E Playwright ─────────────────────────────────────────────────
  // Note : Playwright utilise `use()` comme API de fixtures — ce n'est pas un
  // React Hook. On désactive la règle react-hooks pour ces fichiers.
  {
    files: [
      "tests/e2e/**/*.{ts,tsx}",
      "tests/e2e/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
      "tests/fixtures/**/*.{ts,tsx}",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
      // Playwright fixtures utilisent use() — pas des React Hooks
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
);
