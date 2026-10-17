import { getSession } from "@/core/auth/server";
import { formatSse, realtimeHub } from "@/core/realtime/hub";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

/**
 * Canal de tiempo real (Server-Sent Events).
 *
 * Las pantallas NO dependen de recibir cada evento: al conectarse (o reconectarse) piden el
 * estado completo y, luego, cada evento solo les avisa "algo cambió, vuelve a pedirlo".
 * Por eso una tablet que estuvo sin WiFi media hora no pierde ninguna comanda.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("No autenticado", { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      // El navegador reintenta solo; "retry" fija cada cuánto (ms).
      send("retry: 3000\n\n");
      send(formatSse(null, "ready", { at: new Date().toISOString() }));

      const remove = realtimeHub.add(send);
      // Latido: mantiene viva la conexión y le permite al cliente detectar cortes silenciosos.
      const heartbeat = setInterval(() => send(formatSse(null, "ping", {})), HEARTBEAT_MS);

      cleanup = () => {
        clearInterval(heartbeat);
        remove();
        try {
          controller.close();
        } catch {
          // ya estaba cerrado
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Evita que la compresión o un proxy acumulen los mensajes en vez de enviarlos al momento.
      "Content-Encoding": "none",
      "X-Accel-Buffering": "no",
    },
  });
}
