"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

import { useLiveEvents } from "@/lib/use-live-events";

/** Vuelve a pedir los datos de la página cuando llega un evento con alguno de estos prefijos. */
export function LiveRefresh({ prefixes }: { prefixes: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 200);
  };
  useLiveEvents({
    onConnected: refresh,
    onEvent: (e) => {
      if (prefixes.some((p) => e.type.startsWith(p))) refresh();
    },
  });
  return null;
}
