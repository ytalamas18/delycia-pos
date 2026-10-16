import { requireModule } from "@/components/shell/require-module";

export default function CocinaPage() {
  requireModule("kitchen");
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold">Cocina</h1>
      <p className="text-xl text-muted-foreground">Pendiente: pantalla KDS en el paso 5.</p>
    </div>
  );
}
