import { listLoginUsers } from "@/core/auth/service";
import { appConfig } from "@/core/config/app";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await listLoginUsers();
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-center text-3xl font-bold text-primary">{appConfig.businessName}</h1>
        <LoginForm users={users} />
      </div>
    </main>
  );
}
