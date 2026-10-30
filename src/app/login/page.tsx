import { LOCK_MINUTES, MAX_PIN_ATTEMPTS } from "@/core/auth/service";
import { appConfig } from "@/core/config/app";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-center text-3xl font-bold text-primary">{appConfig.businessName}</h1>
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          Tras {MAX_PIN_ATTEMPTS} intentos fallidos el usuario se bloquea {LOCK_MINUTES} minutos.
        </p>
      </div>
    </main>
  );
}
