"use client";

import { BellRing, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { playReady, unlockAudio } from "@/lib/sound";
import { useLiveEvents } from "@/lib/use-live-events";

type ReadyNotice = { ticketId: string; orderId: string; orderNumber: number; label: string; sequence: number };

/**
 * Aviso al cajero cuando cocina marca una comanda como lista (evento `ticket.ready`):
 * tarjeta verde fija arriba a la derecha + sonido. Se cierra tocándola.
 */
export function ReadyNotifier() {
  const [notices, setNotices] = useState<ReadyNotice[]>([]);

  // El navegador solo permite sonido después de un toque: se habilita con el primer toque en la pantalla.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useLiveEvents({
    onEvent: (e) => {
      if (e.type !== "ticket.ready") return;
      const notice = e.payload as ReadyNotice;
      setNotices((list) => [...list.filter((n) => n.ticketId !== notice.ticketId), notice]);
      playReady();
    },
  });

  const dismiss = (ticketId: string) => setNotices((list) => list.filter((n) => n.ticketId !== ticketId));

  if (notices.length === 0) return null;
  return (
    <div className="fixed top-3 right-3 z-50 flex w-80 flex-col gap-2" role="status" aria-live="assertive">
      {notices.map((n) => (
        <div key={n.ticketId} className="flex items-start gap-3 rounded-xl bg-green-600 p-4 text-white shadow-lg">
          <BellRing className="mt-1 size-7 shrink-0 animate-bounce" />
          <Link href={`/pos?orden=${n.orderId}`} className="flex-1" onClick={() => dismiss(n.ticketId)}>
            <div className="text-lg font-bold">¡Pedido listo! #{n.orderNumber}</div>
            <div>
              {n.label}
              {n.sequence > 1 && " (adicional)"}
            </div>
          </Link>
          <button type="button" aria-label="Cerrar aviso" onClick={() => dismiss(n.ticketId)}>
            <X className="size-6" />
          </button>
        </div>
      ))}
    </div>
  );
}
