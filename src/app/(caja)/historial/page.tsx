import { requireModule } from "@/components/shell/require-module";

export default function Page() {
  requireModule("sales");
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Historial del día</h1>
      <p className="text-muted-foreground">Pendiente: se construye en el paso 7.</p>
    </div>
  );
}
