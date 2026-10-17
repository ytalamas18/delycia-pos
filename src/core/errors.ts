/** Error de negocio con un mensaje apto para mostrar al usuario tal cual. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Prisma: violación de un índice único (ej. nombre repetido). */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
