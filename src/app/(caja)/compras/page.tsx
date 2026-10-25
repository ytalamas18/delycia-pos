import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, businessDate } from "@/core/time";
import { PurchaseList, PurchasesNav } from "@/modules/purchases";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function ComprasPage({ searchParams }: PageProps<"/compras">) {
  const { desde, hasta } = await searchParams;
  const today = businessDate();
  const to = typeof hasta === "string" && ISO.test(hasta) ? hasta : today;
  const from = typeof desde === "string" && ISO.test(desde) ? desde : addDays(today, -30);
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Compras</h1>
        <Button asChild>
          <Link href="/compras/nueva">
            <Plus /> Nueva compra
          </Link>
        </Button>
      </div>
      <PurchasesNav active="/compras" />
      <form className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Desde</span>
          <Input type="date" name="desde" defaultValue={from} className="w-44" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Hasta</span>
          <Input type="date" name="hasta" defaultValue={to} className="w-44" />
        </label>
        <Button type="submit" variant="outline">
          Ver
        </Button>
      </form>
      <PurchaseList from={from} to={to} />
    </>
  );
}
