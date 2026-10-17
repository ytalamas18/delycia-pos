"use client";

import { Delete } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { loginAction, type LoginState } from "./actions";

type LoginUser = { id: string; name: string; role: string };

const PIN_LENGTH = 4;

export function LoginForm({ users }: { users: LoginUser[] }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  const selected = users.find((u) => u.id === userId);

  function press(digit: string) {
    if (pending) return;
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    // Con el 4.º dígito se envía solo, como en un POS.
    if (next.length === PIN_LENGTH) setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  if (!selected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>¿Quién eres?</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {users.map((u) => (
            <Button key={u.id} size="lg" variant="outline" className="h-20 text-xl" onClick={() => setUserId(u.id)}>
              {u.name}
            </Button>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Hola, {selected.name}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setUserId(null);
            setPin("");
          }}
        >
          Cambiar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <form ref={formRef} action={(fd) => { formAction(fd); setPin(""); }}>
          <input type="hidden" name="userId" value={selected.id} />
          <input type="hidden" name="pin" value={pin} />
        </form>

        <div className="flex justify-center gap-3" aria-label="PIN">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={cn("size-5 rounded-full border-2 border-primary", i < pin.length && "bg-primary")}
            />
          ))}
        </div>
        <p className="h-6 text-center font-medium text-destructive" role="alert">
          {pending ? "Verificando…" : state.error}
        </p>

        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <Button key={d} size="lg" variant="secondary" className="h-16 text-2xl" onClick={() => press(d)}>
              {d}
            </Button>
          ))}
          <span />
          <Button size="lg" variant="secondary" className="h-16 text-2xl" onClick={() => press("0")}>
            0
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-16"
            aria-label="Borrar"
            onClick={() => setPin((p) => p.slice(0, -1))}
          >
            <Delete className="size-7" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
