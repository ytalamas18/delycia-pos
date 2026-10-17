import { Plus } from "lucide-react";
import Link from "next/link";

import { LiveRefresh } from "@/components/shell/live-refresh";
import { requireModule } from "@/components/shell/require-module";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/core/auth/server";
import { OpenOrders, PaidInProgress } from "@/modules/sales";

export default async function OrdenesPage() {
  requireModule("sales");
  await requirePermission("sales.sell");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Órdenes por pagar</h1>
        <Button asChild>
          <Link href="/pos">
            <Plus /> Nueva orden
          </Link>
        </Button>
      </div>
      <OpenOrders />
      <PaidInProgress />
      {/* Se actualiza sola cuando cambia algo en ventas o cocina */}
      <LiveRefresh prefixes={["order.", "ticket."]} />
    </div>
  );
}
