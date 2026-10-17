import { NextResponse, type NextRequest } from "next/server";

import { can, homeFor, permissionForPath } from "@/core/auth/permissions";
import { readSessionToken, SESSION_COOKIE } from "@/core/auth/session";

/** Primera barrera: sin sesión → /login; sin permiso para la sección → su pantalla de inicio. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL(homeFor(session.role), request.url)) : NextResponse.next();
  }
  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (pathname === "/") return NextResponse.redirect(new URL(homeFor(session.role), request.url));

  const permission = permissionForPath(pathname);
  if (permission && !can(session.role, permission)) {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Todo menos archivos estáticos y el chequeo de salud.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
