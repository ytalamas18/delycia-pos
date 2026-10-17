import { execSync } from "node:child_process";

import "dotenv/config";

/** Antes de correr los tests, aplica las migraciones a la base de test. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("[tests] TEST_DATABASE_URL no está definida: se omiten las migraciones.");
    return;
  }
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
