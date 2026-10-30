import { requireModule } from "@/components/shell/require-module";
import { requirePermission } from "@/core/auth/server";
import { businessDate } from "@/core/time";
import { HistoryList } from "@/modules/sales";

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function HistorialPage({ searchParams }: PageProps<"/historial">) {
  requireModule("sales");
  await requirePermission("sales.history");
  const sp = await searchParams;
  const fecha = one(sp.fecha);
  const date = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : businessDate();
  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold">Historial</h1>
      <HistoryList
        date={date}
        params={{ estado: one(sp.estado), tipo: one(sp.tipo), canal: one(sp.canal), metodo: one(sp.metodo) }}
      />
    </div>
  );
}
