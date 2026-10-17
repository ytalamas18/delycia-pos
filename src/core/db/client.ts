import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable DATABASE_URL");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

// En desarrollo Next recarga módulos: guardamos una sola instancia en globalThis
// para no abrir conexiones nuevas en cada recarga.
const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  return (globalForDb.prisma ??= createClient());
}

/**
 * Cliente de base de datos. Se crea recién en el primer uso, así importar un módulo
 * (por ejemplo en un test de lógica pura) no exige tener una base de datos.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** Cierra la conexión (tests y scripts). */
export async function disconnectDb() {
  await globalForDb.prisma?.$disconnect();
  globalForDb.prisma = undefined;
}

export type Db = PrismaClient;
