"use client";

import { CheckCircle2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/core/money";

import { SendToKitchenButton } from "./send-to-kitchen-button";

export type PaidSummary = {
  orderId: string;
  number: number;
  totalCents: number;
  changeCents: number;
  /** Platos que todavía no se mandaron a cocina (ej. para llevar cobrado antes). */
  unsentKitchen: number;
  /** Platos de cocina en total (para mostrar "✔ En cocina" cuando ya se enviaron todos). */
  kitchenItems: number;
};

/** Resultado del cobro: vuelto bien grande y botón para imprimir el ticket. */
export function PaidDialog({ paid, onClose }: { paid: PaidSummary; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="text-center">
        <CheckCircle2 className="mx-auto size-16 text-green-600" />
        <DialogTitle className="pr-0 text-2xl">Orden #{paid.number} cobrada</DialogTitle>
        <DialogDescription>Total {formatMoney(paid.totalCents)}</DialogDescription>
        {paid.changeCents > 0 && (
          <div className="rounded-xl bg-yellow-300 p-4 text-black">
            <div className="text-lg font-medium">Vuelto</div>
            <div className="text-5xl font-black tabular-nums">{formatMoney(paid.changeCents)}</div>
          </div>
        )}
        {paid.unsentKitchen > 0 ? (
          <SendToKitchenButton orderId={paid.orderId} count={paid.unsentKitchen} />
        ) : (
          paid.kitchenItems > 0 && <p className="font-semibold text-green-700 dark:text-green-400">✔ En cocina</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" asChild>
            <a href={`/imprimir/ticket/${paid.orderId}`} target="_blank" rel="noreferrer">
              <Printer /> Ticket
            </a>
          </Button>
          <Button size="lg" onClick={onClose}>
            Nueva orden
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
