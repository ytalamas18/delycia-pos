"use client";

/**
 * Sonidos generados con Web Audio (sin archivos). Los navegadores bloquean el audio hasta que
 * el usuario toca la pantalla una vez: por eso las pantallas muestran "Activar sonido".
 */
let context: AudioContext | null = null;

export function unlockAudio(): boolean {
  try {
    context ??= new AudioContext();
    void context.resume();
    return true;
  } catch {
    return false;
  }
}

export function audioUnlocked() {
  return context?.state === "running";
}

function tone(frequency: number, start: number, duration: number, type: OscillatorType = "sine", volume = 0.4) {
  if (!context) return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
  osc.connect(gain).connect(context.destination);
  osc.start(context.currentTime + start);
  osc.stop(context.currentTime + start + duration + 0.05);
}

/** Duración de la alarma de comanda nueva en cocina (segundos). */
const NEW_TICKET_SECONDS = 6;

/**
 * Comanda nueva en cocina: alarma aguda alternada (tipo "ni-no") de ~6 s,
 * para que se oiga por encima del ruido de la cocina.
 */
export function playNewTicket() {
  const beep = 0.16;
  const gap = 0.04;
  for (let t = 0, i = 0; t < NEW_TICKET_SECONDS; t += beep + gap, i++) {
    tone(i % 2 === 0 ? 2000 : 2600, t, beep, "square", 0.25);
  }
}

/** Pedido listo (aviso al cajero): tres tonos. */
export function playReady() {
  tone(880, 0, 0.15);
  tone(1100, 0.17, 0.15);
  tone(1320, 0.34, 0.3);
}

/**
 * Mensaje de caja en cocina: "ding-dong" repetido (~3 s), distinto de la alarma de comanda
 * para que se reconozca sin mirar la pantalla.
 */
export function playKitchenMessage() {
  for (let i = 0; i < 4; i++) {
    const t = i * 0.75;
    tone(1568, t, 0.3, "triangle", 0.5); // sol
    tone(1175, t + 0.32, 0.4, "triangle", 0.5); // re
  }
}

/** Anulación en cocina: tonos graves descendentes (~3 s), muy distintos de comanda nueva y mensaje. */
export function playVoid() {
  for (let i = 0; i < 4; i++) {
    const t = i * 0.8;
    tone(880, t, 0.3, "sawtooth", 0.35);
    tone(440, t + 0.32, 0.4, "sawtooth", 0.35);
  }
}
