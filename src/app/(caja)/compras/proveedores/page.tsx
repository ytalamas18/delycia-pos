import { Pencil } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listSuppliers, PurchasesNav, SupplierForm } from "@/modules/purchases";

export default async function ProveedoresPage() {
  const suppliers = await listSuppliers();
  return (
    <>
      <h1 className="text-2xl font-bold">Proveedores</h1>
      <PurchasesNav active="/compras/proveedores" />
      <SupplierForm />
      <ul className="divide-y rounded-lg border">
        {suppliers.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex-1">
              <div className="font-medium">
                {s.name} {!s.active && <Badge variant="secondary">Inactivo</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">{[s.phone, s.document, s.note].filter(Boolean).join(" · ")}</div>
            </div>
            <Button asChild variant="outline" size="icon" aria-label={`Editar ${s.name}`}>
              <Link href={`/compras/proveedores/${s.id}`}>
                <Pencil />
              </Link>
            </Button>
          </li>
        ))}
        {suppliers.length === 0 && <li className="p-4 text-muted-foreground">Todavía no hay proveedores.</li>}
      </ul>
    </>
  );
}
