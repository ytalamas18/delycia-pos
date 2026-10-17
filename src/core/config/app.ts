/**
 * Configuración general del negocio. Todo lo que el restaurante podría querer
 * ajustar sin tocar lógica vive aquí.
 */
export const appConfig = {
  businessName: "Delycia",
  /** Zona horaria del local: define el "día de negocio" (numeración de órdenes, reportes). */
  timezone: "America/La_Paz",

  currency: {
    code: "BOB",
    symbol: "Bs",
    /** Cantidad de decimales de la moneda. Los montos se guardan en la unidad mínima (centavos si es 2). */
    decimals: 2,
    /** Locale para separadores de miles y decimales. */
    locale: "es-BO",
    symbolPosition: "before" as "before" | "after",
  },

  kitchen: {
    /** Minutos de espera para cambiar el color de la tarjeta en el KDS. */
    warnAfterMinutes: 10,
    dangerAfterMinutes: 20,
  },
} as const;

export type AppConfig = typeof appConfig;
