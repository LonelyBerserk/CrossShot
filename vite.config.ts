/// <reference types="vitest/config" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error type error without @types/node package
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [react()],

  // Tauri development configuration
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,

    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,

    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  // Vitest configuration
  test: {
    environment: "jsdom",

    setupFiles: ["./src/test/setup.ts"],

    clearMocks: true,
    restoreMocks: true,

    // Code coverage configuration
    coverage: {
      provider: "v8",

      // Include all application TypeScript source files
      include: ["src/**/*.{ts,tsx}"],

      // Exclude test infrastructure and declaration files
      exclude: [
        "src/test/**",
        "src/**/*.d.ts",
      ],
    },
  },
}));
