import Link from "next/link";

import { businessDate } from "@/core/time";
import { getPurchaseFormData, PurchaseForm } from "@/modules/purchases";

export default async function NuevaCompraPage() {
  const { items, suppliers } = await getPurchaseFormData();
  return (
    <>
      <Link href="/compras" className="text-sm text-muted-foreground hover:underline">
        ← Volver a compras
      </Link>
      <h1 className="text-2xl font-bold">Nueva compra</h1>
      {items.length === 0 ? (
        <p>
          No hay ítems para comprar. Crea Insumos, Ingredientes o ítems Normales en el{" "}
          <Link href="/catalogo" className="underline">
            Catálogo
          </Link>
          .
        </p>
      ) : (
        <PurchaseForm items={items} suppliers={suppliers} today={businessDate()} />
      )}
    </>
  );
}
