export const dynamic = "force-dynamic";

/** El KDS va siempre en modo oscuro y a pantalla completa, sin el menú de caja. */
export default function CocinaLayout({ children }: LayoutProps<"/cocina">) {
  return <div className="dark flex min-h-screen flex-1 flex-col bg-background text-foreground">{children}</div>;
}
