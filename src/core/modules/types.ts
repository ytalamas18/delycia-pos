import type { Role } from "../auth/permissions";

export type { Role };

/** Enlace del menú. Quién lo ve se decide por el permiso de su ruta (core/auth/permissions). */
export type NavItem = {
  label: string;
  href: string;
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
