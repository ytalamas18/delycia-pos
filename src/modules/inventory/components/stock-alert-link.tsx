import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { stockAlerts } from "../services/stock";

/** Aviso en la cabecera cuando hay ítems en negativo o bajo el mínimo. */
export async function StockAlertLink() {
  const { negative, low } = await stockAlerts();
  if (negative + low === 0) return null;
  return (
    <Link
      href="/inventario?alertas=1"
      className="flex items-center gap-1 rounded-md bg-yellow-300 px-3 py-2 text-sm font-semibold text-black"
      title="Ítems en negativo o bajo el mínimo"
    >
      <TriangleAlert className="size-4" />
      Stock: {negative > 0 && `${negative} en negativo`}
      {negative > 0 && low > 0 && " · "}
      {low > 0 && `${low} bajo mínimo`}
    </Link>
  );
}
