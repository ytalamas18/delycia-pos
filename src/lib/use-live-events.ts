"use client";

import { useEffect, useRef, useState } from "react";

/** Si no llega nada (ni el latido de 15 s) en este tiempo, la conexión se da por muerta. */
const SILENCE_LIMIT_MS = 35_000;

export type LiveEvent = { type: string; payload: Record<string, unknown> };

/**
 * Se conecta al canal de tiempo real (/api/realtime) y se reconecta solo si se corta.
 *
 * - `onConnected` se llama en cada (re)conexión: es el momento de pedir el estado completo,
 *   así no se pierde nada de lo que pasó mientras estaba desconectado.
 * - `onEvent` se llama por cada evento de dominio.
 */
export function useLiveEvents({
  onEvent,
  onConnected,
}: {
  onEvent?: (event: LiveEvent) => void;
  onConnected?: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const handlers = useRef({ onEvent, onConnected });
  useEffect(() => {
    handlers.current = { onEvent, onConnected };
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastMessageAt = Date.now();
    let stopped = false;

    const connect = () => {
      lastMessageAt = Date.now();
      source = new EventSource("/api/realtime");
      source.addEventListener("ready", () => {
        lastMessageAt = Date.now();
        setConnected(true);
        handlers.current.onConnected?.();
      });
      source.addEventListener("ping", () => {
        lastMessageAt = Date.now();
      });
      source.addEventListener("domain", (e) => {
        lastMessageAt = Date.now();
        try {
          handlers.current.onEvent?.(JSON.parse((e as MessageEvent).data));
        } catch {
          // mensaje malformado: se ignora
        }
      });
      source.onerror = () => {
        setConnected(false);
        // EventSource reintenta solo; si el navegador lo dio por cerrado, reintentamos nosotros.
        if (source?.readyState === EventSource.CLOSED && !stopped) {
          source.close();
          retryTimer = setTimeout(connect, 3000);
        }
      };
    };

    // Vigilante: si el WiFi se cae sin cerrar la conexión, el navegador no se entera.
    // Si pasa demasiado tiempo sin latido, se muestra el aviso y se reconecta.
    const watchdog = setInterval(() => {
      if (Date.now() - lastMessageAt > SILENCE_LIMIT_MS) {
        setConnected(false);
        source?.close();
        clearTimeout(retryTimer);
        connect();
      }
    }, 5_000);

    connect();
    return () => {
      stopped = true;
      clearInterval(watchdog);
      clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  return { connected };
}
