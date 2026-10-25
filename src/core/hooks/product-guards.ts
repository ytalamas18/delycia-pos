import type { BaseUnit, ItemType } from "@/generated/prisma/enums";

/**
 * Validaciones que otros módulos agregan antes de cambiar un ítem del catálogo, sin que Catálogo
 * dependa de ellos (ej. Inventario impide cambiar la unidad de un ítem que ya tiene movimientos).
 * Una guarda lanza un DomainError si el cambio no se permite.
 */
export type ProductChange = {
  productId: string;
  before: { type: ItemType; baseUnit: BaseUnit; tracksStock: boolean };
  after: { type: ItemType; baseUnit: BaseUnit; tracksStock: boolean };
};

type Guard = (change: ProductChange) => Promise<void>;

const globalGuards = globalThis as unknown as { productGuards?: Set<Guard> };
const guards = (globalGuards.productGuards ??= new Set<Guard>());

export function registerProductGuard(guard: Guard) {
  guards.add(guard);
}

export async function runProductGuards(change: ProductChange) {
  for (const guard of guards) await guard(change);
}

/** Solo tests: vuelve a empezar sin guardas. */
export function resetProductGuards() {
  guards.clear();
}
