import { can } from "@/core/auth/permissions";
import { requirePermission } from "@/core/auth/server";
import { ConsumptionForm, consumptionFormData, InventoryNav } from "@/modules/inventory";

export default async function SalidaPage() {
  const session = await requirePermission("inventory.consume");
  const items = await consumptionFormData();
  return (
    <>
      <h1 className="text-2xl font-bold">Salida rápida</h1>
      {can(session.role, "inventory.manage") && <InventoryNav active="/inventario/salida" />}
      <p className="text-sm text-muted-foreground">
        Para lo que sale del inventario sin venderse, ej. un envase para que el cliente se lleve lo que no terminó.
      </p>
      <ConsumptionForm items={items} />
    </>
  );
}
