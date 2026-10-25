import Link from "next/link";

import { requirePermission } from "@/core/auth/server";
import { Kardex } from "@/modules/inventory";

export default async function KardexPage({ params }: PageProps<"/inventario/[id]">) {
  await requirePermission("inventory.manage");
  const { id } = await params;
  return (
    <>
      <Link href="/inventario" className="text-sm text-muted-foreground hover:underline">
        ← Volver al inventario
      </Link>
      <Kardex productId={id} />
    </>
  );
}
