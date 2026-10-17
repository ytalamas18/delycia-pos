import "dotenv/config";

// Todos los tests usan la base de TEST. Así nunca se toca la base de desarrollo.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
