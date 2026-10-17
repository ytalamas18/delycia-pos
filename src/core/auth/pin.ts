import { randomInt } from "node:crypto";

import bcrypt from "bcryptjs";

/** Los PIN se guardan hasheados (bcrypt), nunca en texto plano. */
export function hashPin(pin: string): Promise<string> {
  if (!/^\d{4}$/.test(pin)) throw new Error("El PIN debe tener 4 dígitos");
  return bcrypt.hash(pin, 10);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/** PIN fáciles de adivinar: todos iguales (0000), escaleras (1234, 9876) y años 19xx/20xx. */
export function isWeakPin(pin: string): boolean {
  const d = pin.split("").map(Number);
  if (d.every((x) => x === d[0])) return true;
  const steps = d.slice(1).map((x, i) => x - d[i]);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true;
  return /^(19|20)\d\d$/.test(pin);
}

/** PIN aleatorio de 4 dígitos que no sea débil. */
export function randomPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 10_000)).padStart(4, "0");
    if (!isWeakPin(pin)) return pin;
  }
}
