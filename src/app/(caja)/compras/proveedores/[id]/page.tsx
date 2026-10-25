import Link from "next/link";
import { notFound } from "next/navigation";

import { getSupplier, SupplierForm } from "@/modules/purchases";

export default async function ProveedorPage({ params }: PageProps<"/compras/proveedores/[id]">) {
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();
  return (
    <>
      <Link href="/compras/proveedores" className="text-sm text-muted-foreground hover:underline">
        ← Volver a proveedores
      </Link>
      <h1 className="text-2xl font-bold">{supplier.name}</h1>
      <SupplierForm supplier={supplier} />
    </>
  );
}
