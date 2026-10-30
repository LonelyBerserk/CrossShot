import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  // Directories excluded from linting
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "src-tauri/**",
    ],
  },

  // Frontend: React + TypeScript
  {
    files: ["src/**/*.{ts,tsx}"],

    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],

    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.browser,
    },

    plugins: {
      "react-refresh": reactRefresh,
    },

    rules: {
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
    },
  },

  // Vite configuration: Node.js environment
  {
    files: ["vite.config.ts"],

    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],

    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.node,
    },
  },
);
