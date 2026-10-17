"use server";

import { redirect } from "next/navigation";

import { clearSessionCookie, setSessionCookie } from "@/core/auth/server";
import { authenticate } from "@/core/auth/service";
import { homeFor } from "@/core/auth/permissions";
import { createSessionToken } from "@/core/auth/session";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const userId = String(formData.get("userId") ?? "");
  const pin = String(formData.get("pin") ?? "");

  const user = await authenticate(userId, pin);
  if (!user) {
    // Pequeña pausa para que adivinar PINs sea lento.
    await new Promise((r) => setTimeout(r, 600));
    return { error: "PIN incorrecto" };
  }
  await setSessionCookie(await createSessionToken(user));
  redirect(homeFor(user.role));
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
