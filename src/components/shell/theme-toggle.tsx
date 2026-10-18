"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { applyTheme, readTheme, saveTheme, type Theme, type ThemeSection } from "@/lib/theme";

/** El tema vive en la clase "dark" de <html>: el botón la observa en vez de duplicarla en un estado. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const currentTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");

/**
 * Botón ☀️/🌙 del header. Al montarse aplica el tema guardado de su pantalla
 * (ej. un Admin que pasa de Caja a Cocina sin recargar).
 */
export function ThemeToggle({ section }: { section: ThemeSection }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);

  useEffect(() => {
    applyTheme(readTheme(section));
  }, [section]);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={next === "dark" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      title={next === "dark" ? "Tema oscuro" : "Tema claro"}
      disabled={theme === null}
      onClick={() => {
        applyTheme(next);
        saveTheme(section, next);
      }}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
