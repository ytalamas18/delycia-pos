import { z } from "zod";

import { defineSetting } from "@/core/settings";

/** % que se suma a TODOS los precios cuando la orden es del canal PEYA. */
export const peyaMarkupSetting = defineSetting(
  "sales.peyaMarkupPercent",
  z.number().min(0).max(300),
  0,
);
