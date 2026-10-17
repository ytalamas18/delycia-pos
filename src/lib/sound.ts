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

function tone(frequency: number, start: number, duration: number) {
  if (!context) return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.4, context.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
  osc.connect(gain).connect(context.destination);
  osc.start(context.currentTime + start);
  osc.stop(context.currentTime + start + duration + 0.05);
}

/** Comanda nueva en cocina: dos tonos ascendentes. */
export function playNewTicket() {
  tone(660, 0, 0.18);
  tone(880, 0.2, 0.3);
}

/** Pedido listo (aviso al cajero): tres tonos. */
export function playReady() {
  tone(880, 0, 0.15);
  tone(1100, 0.17, 0.15);
  tone(1320, 0.34, 0.3);
}
