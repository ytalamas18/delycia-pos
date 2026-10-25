import { formatQuantity } from "@/core/quantity";
import { compatibleUnits, listPurchasableItems, UNIT_LABEL, UNIT_SHORT, unitFactor } from "@/modules/catalog";

import type { PurchaseFormItem } from "../components/purchase-form";
import { listSuppliers } from "./suppliers";

/** Datos para el formulario de compra (todo serializable: sin Decimal). */
export async function getPurchaseFormData() {
  const [items, suppliers] = await Promise.all([listPurchasableItems(), listSuppliers({ onlyActive: true })]);
  const formItems: PurchaseFormItem[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    unit: UNIT_SHORT[i.baseUnit],
    addsStock: i.tracksStock,
    options: [
      ...i.presentations.map((p) => ({
        value: p.id,
        label: `${p.name} (${formatQuantity(p.factor)} ${UNIT_SHORT[i.baseUnit]})`,
        factor: p.factor.toNumber(),
      })),
      ...compatibleUnits(i.baseUnit).map((u) => ({ value: `unit:${u}`, label: UNIT_LABEL[u], factor: unitFactor(u, i.baseUnit).toNumber() })),
    ],
  }));
  return { items: formItems, suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })) };
}
