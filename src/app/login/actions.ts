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

  const result = await authenticate(userId, pin);
  if (!result.ok) {
    // Pequeña pausa para que adivinar PINs sea lento.
    await new Promise((r) => setTimeout(r, 600));
    if (result.reason === "locked") {
      return { error: `Demasiados intentos. Prueba en ${result.minutesLeft} min o pide al Admin que cambie el PIN.` };
    }
    return { error: "PIN incorrecto" };
  }
  await setSessionCookie(await createSessionToken(result.user));
  redirect(homeFor(result.user.role));
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
