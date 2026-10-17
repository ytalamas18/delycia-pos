import { db } from "../db/client";
import { verifyPin } from "./pin";
import type { SessionUser } from "./session";

/** Usuarios que aparecen como botones en la pantalla de login. */
export function listLoginUsers() {
  return db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

/** Devuelve el usuario si el PIN es correcto; si no, null (sin decir qué falló). */
export async function authenticate(userId: string, pin: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return null;
  if (!(await verifyPin(pin, user.pinHash))) return null;
  return { userId: user.id, name: user.name, role: user.role };
}
