import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { can, homeFor, type Permission } from "./permissions";
import { cookieSecure, readSessionToken, SESSION_COOKIE, SESSION_HOURS, type SessionUser } from "./session";

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Para páginas y Server Actions: exige sesión y permiso.
 * El proxy ya filtra por ruta; esto es la segunda barrera (las actions se pueden llamar directo).
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, permission)) redirect(homeFor(session.role));
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
