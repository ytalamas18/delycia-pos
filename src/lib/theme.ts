/**
 * Tema claro/oscuro POR DISPOSITIVO y por pantalla: la caja puede ir en claro y la tablet de cocina
 * en oscuro. Se guarda en localStorage (no en la base): es una preferencia del aparato, no del usuario.
 */
export type Theme = "light" | "dark";
export type ThemeSection = "pos" | "cocina";

export const DEFAULT_THEME: Record<ThemeSection, Theme> = { pos: "light", cocina: "dark" };

const storageKey = (section: ThemeSection) => `delycia.theme.${section}`;

export function sectionForPath(pathname: string): ThemeSection {
  return pathname === "/cocina" || pathname.startsWith("/cocina/") ? "cocina" : "pos";
}

export function readTheme(section: ThemeSection): Theme {
  try {
    const saved = localStorage.getItem(storageKey(section));
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // modo privado o almacenamiento bloqueado: se usa el tema por defecto
  }
  return DEFAULT_THEME[section];
}

export function saveTheme(section: ThemeSection, theme: Theme) {
  try {
    localStorage.setItem(storageKey(section), theme);
  } catch {
    // sin almacenamiento: el cambio dura hasta recargar
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

/**
 * Se ejecuta en el <head> ANTES de pintar, para que la pantalla no parpadee en el tema equivocado.
 * Repite la lógica de arriba porque corre fuera de React (como texto). Las páginas de impresión
 * (/imprimir) quedan siempre en claro.
 */
export const themeBootScript = `(function(){try{var p=location.pathname;if(p.indexOf("/imprimir")===0)return;var s=(p==="/cocina"||p.indexOf("/cocina/")===0)?"cocina":"pos";var t=null;try{t=localStorage.getItem("delycia.theme."+s)}catch(e){}if(t!=="light"&&t!=="dark")t=s==="cocina"?"dark":"light";var d=document.documentElement;if(t==="dark")d.classList.add("dark");d.style.colorScheme=t}catch(e){}})();`;
