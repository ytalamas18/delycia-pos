"use client";

import { useEffect } from "react";

/** Abre el diálogo de impresión del navegador apenas carga la página. */
export function PrintOnLoad() {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 300);
    return () => clearTimeout(id);
  }, []);
  return (
    <button type="button" onClick={() => window.print()} className="no-print mt-4 w-full rounded border p-2">
      Imprimir de nuevo
    </button>
  );
}
