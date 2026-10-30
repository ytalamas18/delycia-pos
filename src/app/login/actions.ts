"use server";

import { redirect } from "next/navigation";

import { clearSessionCookie, setSessionCookie } from "@/core/auth/server";
import { authenticate, LOGIN_ERROR } from "@/core/auth/service";
import { homeFor } from "@/core/auth/permissions";
import { createSessionToken } from "@/core/auth/session";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const pin = String(formData.get("pin") ?? "");

  const result = await authenticate(username, pin);
  if (!result.ok) {
    // Pequeña pausa para que adivinar PINs sea lento. El mensaje es el mismo pase lo que pase.
    await new Promise((r) => setTimeout(r, 600));
    return { error: LOGIN_ERROR };
  }
  await setSessionCookie(await createSessionToken({ userId: result.user.userId, sessionVersion: result.sessionVersion }));
  redirect(homeFor(result.user));
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
