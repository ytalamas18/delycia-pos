/**
 * Páginas para impresora térmica de 80 mm (impresión del navegador).
 * En el diálogo de impresión: márgenes "Ninguno" y escala 100 %.
 */
export default function ImprimirLayout({ children }: LayoutProps<"/imprimir">) {
  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        @media print { .no-print { display: none !important; } }
        body { background: white; color: black; }
      `}</style>
      <div className="mx-auto w-[72mm] p-[2mm] font-mono text-[13px] leading-snug text-black">{children}</div>
    </>
  );
}
