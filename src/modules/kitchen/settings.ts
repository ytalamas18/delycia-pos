import { z } from "zod";

import { appConfig } from "@/core/config/app";
import { defineSetting } from "@/core/settings";

/** Minutos para pasar la tarjeta del KDS a amarillo y a rojo. */
export const kdsThresholdsSetting = defineSetting(
  "kitchen.thresholds",
  z
    .object({ warnAfterMinutes: z.number().int().positive(), dangerAfterMinutes: z.number().int().positive() })
    .refine((v) => v.dangerAfterMinutes > v.warnAfterMinutes, "El rojo debe ser mayor que el amarillo"),
  { warnAfterMinutes: appConfig.kitchen.warnAfterMinutes, dangerAfterMinutes: appConfig.kitchen.dangerAfterMinutes },
);
