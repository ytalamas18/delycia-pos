import Link from "next/link";

import { requirePermission } from "@/core/auth/server";
import { cn } from "@/lib/utils";
import { InventoryNav, StockTable } from "@/modules/inventory";

export default async function InventarioPage({ searchParams }: PageProps<"/inventario">) {
  await requirePermission("inventory.manage");
  const { alertas } = await searchParams;
  const onlyAlerts = alertas === "1";
  const chip = (active: boolean) =>
    cn("rounded-full border px-4 py-1.5 text-sm font-medium", active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground");
  return (
    <>
      <h1 className="text-2xl font-bold">Inventario</h1>
      <InventoryNav active="/inventario" />
      <div className="flex gap-2">
        <Link href="/inventario" className={chip(!onlyAlerts)}>
          Todos
        </Link>
        <Link href="/inventario?alertas=1" className={chip(onlyAlerts)}>
          Negativos y bajo mínimo
        </Link>
      </div>
      <StockTable onlyAlerts={onlyAlerts} />
    </>
  );
}
