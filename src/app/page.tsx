import { redirect } from "next/navigation";

import { homeFor } from "@/core/auth/permissions";
import { getSession } from "@/core/auth/server";

export default async function Home() {
  const session = await getSession();
  redirect(session ? homeFor(session) : "/login");
}
