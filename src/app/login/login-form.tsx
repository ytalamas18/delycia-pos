"use client";

import { Delete } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { loginAction, type LoginState } from "./actions";

const PIN_LENGTH = 4;
/** El último usuario que entró en este aparato (comodidad: no es un dato de seguridad). */
const LAST_USER_KEY = "delycia.login.username";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const pinPadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_USER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee del aparato al montar
      if (saved) setUsername(saved);
    } catch {}
  }, []);

  function press(digit: string) {
    if (pending) return;
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    // Con el 4.º dígito se envía solo, como en un POS.
    if (next.length === PIN_LENGTH && username.trim()) setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          ref={formRef}
          className="space-y-2"
          action={(fd) => {
            try {
              localStorage.setItem(LAST_USER_KEY, username.trim().toLowerCase());
            } catch {}
            formAction(fd);
            setPin("");
          }}
        >
          <Label htmlFor="username">Usuario</Label>
          <Input
            id="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="h-12 text-lg"
            onKeyDown={(e) => {
              // Enter en el usuario pasa al teclado del PIN en vez de enviar sin PIN.
              if (e.key === "Enter" && pin.length < PIN_LENGTH) {
                e.preventDefault();
                pinPadRef.current?.querySelector("button")?.focus();
              }
            }}
          />
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
        <p className="min-h-6 text-center font-medium text-destructive" role="alert">
          {pending ? "Verificando…" : state.error}
        </p>

        <div ref={pinPadRef} className="grid grid-cols-3 gap-3">
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
