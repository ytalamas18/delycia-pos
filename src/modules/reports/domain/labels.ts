import { paymentMethodLabel } from "@/modules/sales";

/** Nombre visible de un canal (= medio de pago). Un medio nuevo sin etiqueta se muestra tal cual. */
export const channelName = (c: string) => (paymentMethodLabel as Record<string, string>)[c] ?? c;
