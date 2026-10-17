import { requireModule } from "@/components/shell/require-module";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/core/auth/server";
import { getSetting } from "@/core/settings";
import { getSellableCatalog } from "@/modules/catalog";
import { KdsThresholdsForm, kdsThresholdsSetting } from "@/modules/kitchen";
import { PeyaMarkupForm, peyaMarkupSetting } from "@/modules/sales";

export default async function AjustesPage() {
  requireModule("settings");
  await requirePermission("settings.manage");
  const [peya, kds, catalog] = await Promise.all([
    getSetting(peyaMarkupSetting),
    getSetting(kdsThresholdsSetting),
    getSellableCatalog(),
  ]);
  // Vista previa con algunos productos reales del catálogo.
  const samples = catalog.flatMap((c) => c.products).slice(0, 6);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Ajustes</h1>
      <Card>
        <CardHeader>
          <CardTitle>PEYA (PedidosYa)</CardTitle>
          <CardDescription>
            Cuánto más caro se vende en PEYA. Cambiarlo no afecta órdenes ya registradas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PeyaMarkupForm currentPercent={peya} samples={samples} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tiempos de cocina</CardTitle>
          <CardDescription>Colores de las comandas según cuánto llevan esperando.</CardDescription>
        </CardHeader>
        <CardContent>
          <KdsThresholdsForm warn={kds.warnAfterMinutes} danger={kds.dangerAfterMinutes} />
        </CardContent>
      </Card>
    </div>
  );
}
