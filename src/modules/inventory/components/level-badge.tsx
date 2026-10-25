import { Badge } from "@/components/ui/badge";

import { STOCK_LEVEL_LABEL, type StockLevel } from "../domain/labels";

export function LevelBadge({ level }: { level: StockLevel }) {
  if (level === "ok") return null;
  return <Badge className={level === "negative" ? "bg-red-600 text-white" : "bg-yellow-300 text-black"}>{STOCK_LEVEL_LABEL[level]}</Badge>;
}
