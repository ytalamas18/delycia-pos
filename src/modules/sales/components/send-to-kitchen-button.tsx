"use client";

import { ChefHat } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import type { ActionResult } from "@/core/actions/types";
import { cn } from "@/lib/utils";

import { sendToKitchenAction } from "../actions";

/** Envía a cocina lo pendiente de una orden ya guardada (por ejemplo, una para llevar cobrada antes). */
export function SendToKitchenButton({ orderId, count, className }: { orderId: string; count: number; className?: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  if (result?.ok) return <FormStatus state={result} className={className} />;
  return (
    <div className={cn("space-y-1", className)}>
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await sendToKitchenAction(orderId)))}
      >
        <ChefHat /> {pending ? "Enviando…" : `Enviar a cocina (${count})`}
      </Button>
      {result && <FormStatus state={result} />}
    </div>
  );
}
