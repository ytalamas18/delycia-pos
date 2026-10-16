import { requireModule } from "@/components/shell/require-module";

export default function Page() {
  requireModule("sales");
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Vender</h1>
      <p className="text-muted-foreground">Pendiente: se construye en el paso 4.</p>
    </div>
  );
}
