import { requirePermission } from "@/core/auth/server";
import { formatDay } from "@/core/export";
import { formatQuantity } from "@/core/quantity";
import { businessDate } from "@/core/time";
import { formatUnitCost } from "@/modules/catalog";
import { InventoryNav, listProductions, ProductionForm, productionFormData } from "@/modules/inventory";

export default async function IngresoPage() {
  await requirePermission("inventory.receive");
  const [ingredients, recent] = await Promise.all([productionFormData(), listProductions()]);
  return (
    <>
      <h1 className="text-2xl font-bold">Ingreso a inventario</h1>
      <InventoryNav active="/inventario/ingreso" />
      <p className="text-sm text-muted-foreground">
        Lo que produce cocina (ej. medallones). Suma al stock del ingrediente y guarda su costo. No registra gasto: el
        gasto ya se registró al comprar los insumos.
      </p>
      {ingredients.length === 0 ? (
        <p>No hay Ingredientes en el catálogo todavía.</p>
      ) : (
        <ProductionForm ingredients={ingredients} today={businessDate()} />
      )}
      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Últimos ingresos</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {recent.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-3 p-2">
                <span className="w-24">{formatDay(e.date)}</span>
                <span className="flex-1">
                  +{formatQuantity(e.quantity)} {e.productName}
                </span>
                <span className="text-muted-foreground">{e.unitCostCents ? `${formatUnitCost(e.unitCostCents)} c/u` : "sin costo"}</span>
                {e.note && <span className="w-full text-muted-foreground">{e.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
