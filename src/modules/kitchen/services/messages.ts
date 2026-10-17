import { db } from "@/core/db/client";
import { runInTransaction } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";

const MAX_LENGTH = 80;

export type Sender = { userId: string; name: string };

/** Caja manda un mensaje a cocina. Llega en tiempo real como un aviso con sonido. */
export async function sendKitchenMessage(text: string, sender: Sender) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) throw new DomainError("Escribe el mensaje.");
  if (clean.length > MAX_LENGTH) throw new DomainError(`Máximo ${MAX_LENGTH} caracteres.`);

  return runInTransaction(async (tx, publish) => {
    const message = await tx.kitchenMessage.create({
      data: { text: clean, senderId: sender.userId, senderName: sender.name },
    });
    await publish("kitchen.message_sent", { messageId: message.id, text: message.text, senderName: sender.name });
    return message;
  });
}

/** Cocina marca el mensaje como visto: desaparece de la pantalla y caja recibe la confirmación. */
export async function acknowledgeKitchenMessage(messageId: string, by: Sender) {
  return runInTransaction(async (tx, publish) => {
    const message = await tx.kitchenMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new DomainError("El mensaje no existe.");
    if (message.acknowledgedAt) return message; // ya visto (dos toques seguidos o dos tablets): no es error
    const updated = await tx.kitchenMessage.update({
      where: { id: messageId },
      data: { acknowledgedAt: new Date(), acknowledgedById: by.userId, acknowledgedByName: by.name },
    });
    await publish("kitchen.message_seen", { messageId, text: message.text, seenBy: by.name });
    return updated;
  });
}

/** Mensajes que cocina todavía no marcó como vistos (el más antiguo primero). */
export function listPendingMessages() {
  return db.kitchenMessage.findMany({ where: { acknowledgedAt: null }, orderBy: { createdAt: "asc" } });
}
