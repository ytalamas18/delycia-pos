/** Para comparar nombres escritos a mano: sin mayúsculas, tildes ni espacios de más. */
export function textKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}
