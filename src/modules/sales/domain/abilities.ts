import { can, type PermissionHolder } from "@/core/auth/permissions";

/** Qué puede hacer el usuario en las pantallas de venta (datos serializables para los componentes cliente). */
export type SalesAbilities = {
  charge: boolean;
  discount: boolean;
  void: boolean;
  /** Al anular pide usuario y PIN de alguien con "Autorizar anulaciones". */
  voidNeedsAuthorization: boolean;
};

export function salesAbilities(user: PermissionHolder): SalesAbilities {
  const authorize = can(user, "sales.void.authorize");
  return {
    charge: can(user, "sales.charge"),
    discount: can(user, "sales.discount"),
    void: authorize || can(user, "sales.void"),
    voidNeedsAuthorization: !authorize,
  };
}
