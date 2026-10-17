import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["tests/support/env.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    // Los tests de integración comparten una base: se corren de a un archivo.
    fileParallelism: false,
    // Integración contra Postgres real: el seed (menú + hash de PIN con bcrypt) puede pasar de 5 s.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
