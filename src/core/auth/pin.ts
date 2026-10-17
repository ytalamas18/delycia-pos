import bcrypt from "bcryptjs";

/** Los PIN se guardan hasheados (bcrypt), nunca en texto plano. */
export function hashPin(pin: string): Promise<string> {
  if (!/^\d{4}$/.test(pin)) throw new Error("El PIN debe tener 4 dígitos");
  return bcrypt.hash(pin, 10);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
