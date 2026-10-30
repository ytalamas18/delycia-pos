import { jwtVerify, SignJWT } from "jose";

import type { Permission } from "./permissions";

/**
 * Sesión en una cookie firmada (JWT HS256). Solo guarda quién es y la versión de su sesión: el rol y los
 * permisos se leen de la base en cada request (así desactivar, cambiar el rol o los permisos aplica al
 * instante). Resetear el PIN sube `sessionVersion` y la cookie vieja deja de valer.
 * Este archivo no usa APIs de Next, así sirve en el proxy, en el servidor y en tests.
 */
export const SESSION_COOKIE = "delycia_session";
export const SESSION_HOURS = 14; // cubre un turno largo

/** Lo que va en la cookie. */
export type SessionClaims = { userId: string; sessionVersion: number };

/** El usuario de la sesión, cargado de la base (ver loadSessionUser). */
export type SessionUser = {
  userId: string;
  name: string;
  username: string;
  roleId: string;
  roleName: string;
  /** Rol Admin de sistema. */
  isAdmin: boolean;
  permissions: Permission[];
};

/**
 * ¿La cookie de sesión lleva el flag Secure? Solo si la app se sirve por HTTPS (si no, el navegador
 * la descarta y nadie puede iniciar sesión). COOKIE_SECURE ("true"/"false") manda; si falta, se deduce
 * de APP_URL (la URL base pública, ej. http://54.0.0.1 o https://pos.delycia.com).
 */
export function cookieSecure(env: Record<string, string | undefined> = process.env): boolean {
  if (env.COOKIE_SECURE === "true") return true;
  if (env.COOKIE_SECURE === "false") return false;
  return env.APP_URL?.trim().toLowerCase().startsWith("https://") ?? false;
}

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET falta o es muy corto (mínimo 16 caracteres)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ sv: claims.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

export async function readSessionToken(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    // Las cookies de antes de los roles no traen `sv`: no valen y piden entrar de nuevo.
    if (!payload.sub || typeof payload.sv !== "number") return null;
    return { userId: payload.sub, sessionVersion: payload.sv };
  } catch {
    return null;
  }
}
