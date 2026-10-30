import { NextResponse, type NextRequest } from "next/server";

import { can, homeFor, permissionForPath } from "@/core/auth/permissions";
import { loadSessionUser } from "@/core/auth/service";
import { readSessionToken, SESSION_COOKIE } from "@/core/auth/session";

/**
 * Primera barrera: sin sesión → /login; sin permiso para la sección → su pantalla de inicio.
 * El usuario y su rol se leen de la base en cada request (el proxy corre en Node), así desactivar a alguien
 * o cambiar sus permisos aplica al instante.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = await readSessionToken(token);
  const session = claims ? await loadSessionUser(claims) : null;

  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL(homeFor(session), request.url));
    return withoutStaleCookie(NextResponse.next(), token);
  }
  if (!session) {
    if (pathname.startsWith("/api/")) return withoutStaleCookie(NextResponse.json({ error: "No autenticado" }, { status: 401 }), token);
    return withoutStaleCookie(NextResponse.redirect(new URL("/login", request.url)), token);
  }
  if (pathname === "/") return NextResponse.redirect(new URL(homeFor(session), request.url));

  const permission = permissionForPath(pathname);
  if (permission && !can(session, permission)) {
    return NextResponse.redirect(new URL(homeFor(session), request.url));
  }
  return NextResponse.next();
}

/** Una cookie que ya no vale (usuario desactivado, PIN reseteado) se borra. */
function withoutStaleCookie(response: NextResponse, token: string | undefined) {
  if (token) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  // Todo menos archivos estáticos y el chequeo de salud.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
