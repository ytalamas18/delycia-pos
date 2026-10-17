import { jwtVerify, SignJWT } from "jose";

import type { Role } from "./permissions";

/**
 * Sesión en una cookie firmada (JWT HS256). No guarda nada sensible: solo quién es y su perfil.
 * Este archivo no usa APIs de Next, así sirve en el proxy, en el servidor y en tests.
 */
export const SESSION_COOKIE = "delycia_session";
export const SESSION_HOURS = 14; // cubre un turno largo

export type SessionUser = { userId: string; name: string; role: Role };

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET falta o es muy corto (mínimo 16 caracteres)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

export async function readSessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.name !== "string" || typeof payload.role !== "string") return null;
    return { userId: payload.sub, name: payload.name, role: payload.role as Role };
  } catch {
    return null;
  }
}
