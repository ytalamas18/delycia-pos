import type { PrismaClient } from "@/generated/prisma/client";

import { seedRoles } from "../../prisma/seed-data";

/** Crea los roles de sistema (si faltan) y un usuario con uno de ellos. Para tests que no corren el seed. */
export async function createTestUser(
  db: PrismaClient,
  { name = "Admin", username = name.toLowerCase(), systemRole = "ADMIN", pinHash = "x" }: { name?: string; username?: string; systemRole?: string; pinHash?: string } = {},
) {
  await seedRoles(db);
  const role = await db.role.findUniqueOrThrow({ where: { systemKey: systemRole } });
  return db.user.create({ data: { name, username, roleId: role.id, pinHash } });
}
