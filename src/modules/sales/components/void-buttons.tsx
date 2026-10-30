"use client";

import { Ban } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { cancelOrderAction, voidItemAction } from "../actions";
import { VoidDialog } from "./void-dialog";

/** "Anular orden" desde el historial (por pagar, pagada o cerrada). */
export function CancelOrderButton({
  orderId,
  number,
  wasPaid,
  needsAuthorization,
}: {
  orderId: string;
  number: number;
  wasPaid: boolean;
  needsAuthorization: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Ban /> Anular orden
      </Button>
      {open && (
        <VoidDialog
          title={`Anular la orden #${number}`}
          description={
            wasPaid
              ? "Ya está cobrada: el pago queda como DEVUELTO (devuelve el dinero al cliente) y no suma en la caja."
              : "La orden queda como Anulada (no se borra) y lo que esté en cocina se marca ANULADO."
          }
          needsAuthorization={needsAuthorization}
          onClose={() => setOpen(false)}
          onConfirm={(input) => cancelOrderAction(orderId, input)}
        />
      )}
    </>
  );
}

/** "Anular" un ítem de una orden por pagar. */
export function VoidItemButton({
  orderId,
  itemId,
  label,
  needsAuthorization,
}: {
  orderId: string;
  itemId: string;
  label: string;
  needsAuthorization: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        <Ban className="size-4" /> Anular
      </Button>
      {open && (
        <VoidDialog
          title={`Anular ${label}`}
          description="Deja de sumar en la cuenta. Si ya está en cocina, se marca ANULADO allí."
          needsAuthorization={needsAuthorization}
          onClose={() => setOpen(false)}
          onConfirm={(input) => voidItemAction(orderId, itemId, input)}
        />
      )}
    </>
  );
}
