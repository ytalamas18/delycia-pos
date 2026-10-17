/** Reescribe sortOrder como 0..n-1 para que dos elementos nunca compartan posición. */
export function normalizedOrder<T extends { id: string; sortOrder: number }>(items: T[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => ({ id: item.id, sortOrder: index }));
}
