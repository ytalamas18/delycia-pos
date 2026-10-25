import { requirePermission } from "@/core/auth/server";
import { businessDate } from "@/core/time";
import { CountForm, countFormData, InventoryNav } from "@/modules/inventory";

export default async function ConteoPage() {
  await requirePermission("inventory.manage");
  const items = await countFormData();
  return (
    <>
      <h1 className="text-2xl font-bold">Conteo físico</h1>
      <InventoryNav active="/inventario/conteo" />
      {items.length === 0 ? <p>Ningún ítem maneja stock todavía.</p> : <CountForm items={items} today={businessDate()} />}
    </>
  );
}
