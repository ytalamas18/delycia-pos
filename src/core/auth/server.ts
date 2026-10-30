import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { canAny, homeFor, type Permission } from "./permissions";
import { loadSessionUser } from "./service";
import { cookieSecure, readSessionToken, SESSION_COOKIE, SESSION_HOURS, type SessionUser } from "./session";

/** Usuario de la sesión con los permisos actuales de su rol (una consulta por request). */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const claims = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  return claims ? loadSessionUser(claims) : null;
});

/**
 * Para páginas y Server Actions: exige sesión y permiso (con una lista, basta uno de ellos).
 * El proxy ya filtra por ruta; esto es la segunda barrera (las actions se pueden llamar directo).
 */
export async function requirePermission(permission: Permission | readonly Permission[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAny(session, typeof permission === "string" ? [permission] : permission)) redirect(homeFor(session));
  return session;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Sin dominio se entra por http://IP: el flag Secure solo se pone cuando hay HTTPS.
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
