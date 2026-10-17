"use client";

import { CheckCheck, Megaphone, Send, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/core/actions/types";
import { useLiveEvents } from "@/lib/use-live-events";

import { sendKitchenMessageAction } from "../actions";

type Seen = { messageId: string; text: string; seenBy: string };

/**
 * Botón de la barra de caja para mandar mensajes a cocina ("LLEGÓ GENTE", "MÁS PAPA"...).
 * Cuando cocina toca "Visto", aquí aparece la confirmación.
 */
export function KitchenMessageButton({ quickMessages }: { quickMessages: string[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [seen, setSeen] = useState<Seen[]>([]);
  const [pending, startTransition] = useTransition();

  useLiveEvents({
    onEvent: (e) => {
      if (e.type !== "kitchen.message_seen") return;
      const s = e.payload as Seen;
      setSeen((list) => [...list.filter((x) => x.messageId !== s.messageId), s].slice(-3));
      setTimeout(() => setSeen((list) => list.filter((x) => x.messageId !== s.messageId)), 8000);
    },
  });

  function send(message: string) {
    startTransition(async () => {
      const r = await sendKitchenMessageAction(message);
      setResult(r);
      if (r.ok) {
        setText("");
        setOpen(false);
        setTimeout(() => setResult(null), 4000);
      }
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setResult(null); setOpen(true); }} className="border-sky-600 text-sky-700">
        <Megaphone /> Mensaje a cocina
      </Button>

      {/* Avisos: enviado / cocina lo vio */}
      <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
        {result?.ok && !open && (
          <div className="rounded-lg bg-sky-700 px-4 py-2 font-medium text-white shadow-lg">📣 {result.message}</div>
        )}
        {seen.map((s) => (
          <div key={s.messageId} className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 font-medium text-white shadow-lg">
            <CheckCheck className="size-5" /> {s.seenBy} vio: {s.text}
            <button type="button" aria-label="Cerrar" onClick={() => setSeen((l) => l.filter((x) => x.messageId !== s.messageId))}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Mensaje a cocina</DialogTitle>
            <DialogDescription>Toca uno para enviarlo al instante, o escribe otro.</DialogDescription>
            <div className="grid grid-cols-2 gap-2">
              {quickMessages.map((m) => (
                <Button
                  key={m}
                  size="lg"
                  variant="secondary"
                  className="h-16 text-base font-bold whitespace-normal uppercase"
                  disabled={pending}
                  onClick={() => send(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
            >
              <Input
                value={text}
                maxLength={80}
                placeholder="Otro mensaje…"
                aria-label="Mensaje"
                onChange={(e) => setText(e.target.value)}
                className="text-lg"
              />
              <Button type="submit" size="lg" disabled={pending || !text.trim()}>
                <Send /> Enviar
              </Button>
            </form>
            {result && !result.ok && <FormStatus state={result} />}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
