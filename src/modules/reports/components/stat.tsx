/** Tarjeta de número grande (resumen de un reporte). */
export function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={tone === "danger" ? "text-2xl font-bold text-red-700 tabular-nums dark:text-red-400" : "text-2xl font-bold tabular-nums"}>
        {value}
      </div>
    </div>
  );
}
