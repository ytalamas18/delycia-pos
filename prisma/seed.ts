import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { seed } from "./seed-data";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

seed(db)
  .then((r) => {
    console.log(
      r.loaded ? `Seed listo: menú de Delycia cargado (${r.products} productos).` : "Seed listo (el menú ya estaba cargado).",
    );
    for (const u of r.updates) console.log(`Actualización del menú aplicada → ${u}`);
    // Solo se muestran los PIN generados al azar (los de variables de entorno ya los conoce quien los puso).
    for (const u of r.users) {
      console.log(
        u.generated
          ? `Usuario ${u.name} creado. PIN inicial: ${u.pin} (cámbialo en Ajustes)`
          : `Usuario ${u.name} creado con el PIN de ${u.name.toUpperCase()}_PIN.`,
      );
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
