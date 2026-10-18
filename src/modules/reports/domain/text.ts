/** Clave para agrupar textos escritos a mano: sin mayúsculas, tildes, espacios de más ni punto final. */
export function textKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!]+$/, "");
}
