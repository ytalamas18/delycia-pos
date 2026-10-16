/** Perfiles de usuario. Hoy: caja y cocina (+ admin). La estructura admite permisos finos después. */
export type Role = "ADMIN" | "CASHIER" | "KITCHEN";

export type NavItem = {
  label: string;
  href: string;
  /** Roles que ven este enlace. */
  roles: Role[];
};

/**
 * Contrato que cumple cada módulo para engancharse a la app.
 * La app nunca importa las tripas de un módulo: solo su definición e `index.ts`.
 */
export type ModuleDefinition = {
  id: string;
  name: string;
  navItems: NavItem[];
  /** Registra los suscriptores de eventos del módulo. Se llama una vez al arrancar. */
  registerSubscribers?: () => void;
};
