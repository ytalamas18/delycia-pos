import { FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Botones "Exportar PDF" / "Exportar Excel". `report` es la clave de /api/exportar/<report>
 * y `params` los MISMOS filtros que tiene la pantalla, así se exporta exactamente lo que se ve.
 */
export function ExportButtons({ report, params }: { report: string; params: Record<string, string | undefined> }) {
  const href = (formato: "pdf" | "xlsx") => {
    const query = Object.fromEntries(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
    return `/api/exportar/${report}?${new URLSearchParams({ ...query, formato })}`;
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <a href={href("pdf")} download>
          <FileText /> Exportar PDF
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href={href("xlsx")} download>
          <FileSpreadsheet /> Exportar Excel
        </a>
      </Button>
    </div>
  );
}
