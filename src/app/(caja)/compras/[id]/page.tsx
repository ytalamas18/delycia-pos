import Link from "next/link";

import { PurchaseDetail } from "@/modules/purchases";

export default async function CompraPage({ params, searchParams }: PageProps<"/compras/[id]">) {
  const { id } = await params;
  const { nueva } = await searchParams;
  return (
    <>
      <Link href="/compras" className="text-sm text-muted-foreground hover:underline">
        ← Volver a compras
      </Link>
      {nueva && <p className="font-medium text-green-700 dark:text-green-400">Compra registrada.</p>}
      <PurchaseDetail id={id} />
    </>
  );
}
