"use client";

import { Ban, Bell, Check, Megaphone, Printer, Undo2, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/core/config/app";
import { audioUnlocked, playKitchenMessage, playNewTicket, playReady, playVoid, unlockAudio } from "@/lib/sound";
import { useLiveEvents } from "@/lib/use-live-events";
import { cn } from "@/lib/utils";

import {
  acknowledgeKitchenMessageAction,
  acknowledgeVoidAction,
  advanceTicketAction,
  toggleItemReadyAction,
  undoTicketAction,
} from "../actions";
import { advanceLabel, waitLevel, type WaitLevel } from "../domain/status";
import type { KdsMessage, KdsSnapshot, KdsTicket } from "../services/snapshot";

const clock = new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: appConfig.timezone });

/** Cambia si se anula otro ítem de la misma comanda: así vuelve a sonar. */
const alertKey = (t: KdsTicket) => `${t.id}:${t.status}:${t.items.filter((i) => i.voided).length}`;

const levelStyles: Record<WaitLevel, string> = {
  ok: "border-green-500",
  warn: "border-yellow-400",
  danger: "border-red-500",
};
const levelTimer: Record<WaitLevel, string> = {
  ok: "bg-green-600 text-white",
  warn: "bg-yellow-400 text-black",
  danger: "bg-red-600 text-white animate-pulse",
};

export function KdsBoard({ initial, canOperate }: { initial: KdsSnapshot; canOperate: boolean }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [tab, setTab] = useState<"active" | "recent">("active");
  const [soundOn, setSoundOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const known = useRef(new Set(initial.active.map((t) => t.id)));
  const knownMessages = useRef(new Set(initial.messages.map((m) => m.id)));
  const knownAlerts = useRef(new Set(initial.active.filter((t) => t.voidAlert).map(alertKey)));
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/cocina/comandas", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        router.push("/login");
        return;
      }
      if (!res.ok) return;
      const next: KdsSnapshot = await res.json();
      const fresh = next.active.filter((t) => !known.current.has(t.id));
      if (fresh.length > 0 && audioUnlocked()) playNewTicket();
      known.current = new Set(next.active.map((t) => t.id));
      // Mensaje nuevo de caja: sonido propio (distinto al de comanda).
      const freshMessages = next.messages.filter((m) => !knownMessages.current.has(m.id));
      if (freshMessages.length > 0 && fresh.length === 0 && audioUnlocked()) playKitchenMessage();
      knownMessages.current = new Set(next.messages.map((m) => m.id));
      // Anulación nueva (orden entera o un ítem): sonido propio, tiene prioridad sobre los demás.
      const alerts = next.active.filter((t) => t.voidAlert).map(alertKey);
      if (alerts.some((k) => !knownAlerts.current.has(k)) && audioUnlocked()) playVoid();
      knownAlerts.current = new Set(alerts);
      setSnapshot(next);
    } catch {
      // sin red: el aviso de conexión ya lo muestra; se reintenta al reconectar
    }
  }, [router]);

  // Muchos eventos seguidos (ej. marcar varios ítems) → una sola recarga.
  const scheduleRefetch = useCallback(() => {
    clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(refetch, 150);
  }, [refetch]);

  const { connected } = useLiveEvents({
    onConnected: refetch,
    onEvent: (e) => {
      if (e.type.startsWith("order.") || e.type.startsWith("ticket.") || e.type.startsWith("kitchen.")) scheduleRefetch();
    },
  });

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      // Si la tablet suspendió el audio (pantalla apagada, cambio de app), vuelve a pedir el toque.
      if (!audioUnlocked()) setSoundOn(false);
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const tickets = tab === "active" ? snapshot.active : snapshot.recent;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {!connected && (
        <div className="flex items-center gap-3 rounded-lg bg-red-600 px-4 py-3 text-lg font-semibold text-white" role="alert">
          <WifiOff /> Sin conexión con el servidor. Reconectando… (no se pierde ninguna comanda)
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-3xl font-bold">Cocina</h1>
        <TabButton active={tab === "active"} onClick={() => setTab("active")}>
          En curso ({snapshot.active.length})
        </TabButton>
        <TabButton active={tab === "recent"} onClick={() => setTab("recent")}>
          Recientes
        </TabButton>
        {!soundOn && (
          <Button
            size="lg"
            className="ml-auto bg-yellow-400 text-black hover:bg-yellow-300"
            onClick={() => {
              const ok = unlockAudio();
              // Tono de prueba: confirma en la cocina que el volumen de la tablet se oye.
              if (ok) playReady();
              setSoundOn(ok);
            }}
          >
            <Bell /> Activar sonido
          </Button>
        )}
      </div>

      {snapshot.messages.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2" role="alert" aria-live="assertive">
          {snapshot.messages.map((m) => (
            <MessageCard key={m.id} message={m} canOperate={canOperate} onChanged={scheduleRefetch} />
          ))}
        </div>
      )}

      {tickets.length === 0 ? (
        <p className="py-20 text-center text-2xl text-muted-foreground">
          {tab === "active" ? "No hay comandas pendientes 👌" : "Nada listo en las últimas horas."}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-4">
          {tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              now={now}
              thresholds={snapshot.thresholds}
              canOperate={canOperate}
              onChanged={scheduleRefetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-12 rounded-lg px-5 text-lg font-semibold",
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TicketCard({
  ticket,
  now,
  thresholds,
  canOperate,
  onChanged,
}: {
  ticket: KdsTicket;
  now: number;
  thresholds: KdsSnapshot["thresholds"];
  canOperate: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const minutes = Math.max(0, Math.floor((now - new Date(ticket.receivedAt).getTime()) / 60_000));
  const level = waitLevel(minutes, thresholds);
  const inKitchen = ticket.status === "PENDING" || ticket.status === "IN_PROGRESS";
  const cancelled = ticket.status === "CANCELLED";

  const run = (action: () => Promise<unknown>) =>
    startTransition(async () => {
      await action();
      onChanged();
    });

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border-4 bg-card",
        inKitchen && levelStyles[level],
        (ticket.status === "READY" || ticket.status === "DELIVERED") && "border-green-700 opacity-90",
        cancelled && "border-red-600 bg-red-50 dark:bg-red-950",
        ticket.voidAlert && "border-red-600 ring-4 ring-red-500",
        pending && "opacity-60",
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b p-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-3xl font-black">#{ticket.orderNumber}</span>
            {ticket.channel === "PEYA" && <Badge className="text-sm">PEYA</Badge>}
            {ticket.sequence > 1 && <Badge className="bg-blue-600 text-sm text-white">ADICIONAL {ticket.sequence - 1}</Badge>}
          </div>
          <div className="text-xl font-semibold">
            {ticket.label}
            {ticket.sequence > 1 && <span className="text-blue-700 dark:text-blue-300">, adicional</span>}
          </div>
          <div className="text-sm text-muted-foreground">Entró {clock.format(new Date(ticket.receivedAt))}</div>
        </div>
        {inKitchen && (
          <span className={cn("rounded-lg px-3 py-1 text-2xl font-bold tabular-nums", levelTimer[level])}>
            {minutes} min
          </span>
        )}
        {(ticket.status === "READY" || ticket.status === "DELIVERED") && (
          <span className="rounded-lg bg-green-600 px-3 py-1 text-lg font-bold text-white">LISTA ✔</span>
        )}
      </header>

      {cancelled && (
        <div className={cn("bg-red-600 py-3 text-center text-3xl font-black tracking-wide text-white", ticket.voidAlert && "animate-pulse")}>
          ANULADA — NO PREPARAR
          <div className="text-lg font-semibold">
            {[ticket.cancelledAt && clock.format(new Date(ticket.cancelledAt)), ticket.items[0]?.voidReason]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      )}
      {ticket.voidAlert && !cancelled && (
        <div className="animate-pulse bg-red-600 py-2 text-center text-2xl font-black tracking-wide text-white">ÍTEM ANULADO — REVISAR</div>
      )}

      <ul className="flex-1 divide-y">
        {ticket.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={!canOperate || !inKitchen || item.voided || pending}
              onClick={() => run(() => toggleItemReadyAction(item.id))}
              className={cn(
                "flex w-full items-start gap-3 p-3 text-left disabled:cursor-default",
                item.ready && "opacity-50",
                item.voided && "bg-red-100 dark:bg-red-950",
              )}
            >
              <span className={cn("text-2xl font-black tabular-nums", (item.ready || item.voided) && "line-through")}>
                {item.quantity}×
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className={cn("block text-2xl leading-tight font-bold", (item.ready || item.voided) && "line-through")}>
                  {item.name}
                </span>
                {item.voided && (
                  <span className="block text-lg font-black text-red-700 dark:text-red-400">
                    ANULADO
                    {!cancelled &&
                      [item.voidedAt && clock.format(new Date(item.voidedAt)), item.voidReason]
                        .filter(Boolean)
                        .map((x) => ` · ${x}`)
                        .join("")}
                  </span>
                )}
                {item.serviceType === "TAKEAWAY" && ticket.serviceType === "DINE_IN" && (
                  <span className="inline-block rounded bg-orange-500 px-2 text-base font-bold text-black">PARA LLEVAR</span>
                )}
                {item.modifiers.length > 0 && (
                  <span className="block text-lg font-semibold text-amber-700 dark:text-amber-300">{item.modifiers.join(" · ")}</span>
                )}
                {item.note && (
                  <span className="block rounded bg-yellow-300 px-2 py-0.5 text-lg font-bold text-black">⚠ {item.note}</span>
                )}
              </span>
              {item.ready && <Check className="size-8 shrink-0 text-green-600 dark:text-green-400" />}
            </button>
          </li>
        ))}
      </ul>

      <footer className="flex gap-2 border-t p-3">
        {canOperate && ticket.voidAlert && (
          <Button
            size="lg"
            className="h-16 flex-1 bg-red-600 text-xl text-white hover:bg-red-700"
            disabled={pending}
            onClick={() => run(() => acknowledgeVoidAction(ticket.id))}
          >
            <Ban className="size-6" /> Entendido
          </Button>
        )}
        {canOperate && advanceLabel[ticket.status] && (
          <Button
            size="lg"
            className="h-16 flex-1 text-xl"
            disabled={pending}
            onClick={() => run(() => advanceTicketAction(ticket.id))}
          >
            {advanceLabel[ticket.status]}
          </Button>
        )}
        {canOperate && ticket.status !== "PENDING" && !cancelled && (
          <Button
            variant="secondary"
            size="icon"
            className="size-16"
            aria-label="Deshacer"
            title="Deshacer (volver al estado anterior)"
            disabled={pending}
            onClick={() => run(() => undoTicketAction(ticket.id))}
          >
            <Undo2 className="size-7" />
          </Button>
        )}
        <Button asChild variant="secondary" size="icon" className="size-16" aria-label="Imprimir comanda">
          <a href={`/imprimir/comanda/${ticket.id}`} target="_blank" rel="noreferrer">
            <Printer className="size-7" />
          </a>
        </Button>
      </footer>
    </article>
  );
}

function MessageCard({
  message,
  canOperate,
  onChanged,
}: {
  message: KdsMessage;
  canOperate: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-4 rounded-xl border-4 border-sky-300 bg-sky-600 p-4 text-white shadow-lg">
      <Megaphone className="size-10 shrink-0 animate-pulse" />
      <div className="min-w-0 flex-1">
        <div className="text-3xl leading-tight font-black uppercase">{message.text}</div>
        <div className="text-sm opacity-90">
          {message.senderName} · {clock.format(new Date(message.createdAt))}
        </div>
      </div>
      {canOperate && (
        <Button
          size="lg"
          className="h-16 shrink-0 bg-white text-xl text-sky-800 hover:bg-sky-50"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await acknowledgeKitchenMessageAction(message.id);
              onChanged();
            })
          }
        >
          Visto ✔
        </Button>
      )}
    </div>
  );
}
