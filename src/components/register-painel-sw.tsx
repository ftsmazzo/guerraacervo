"use client";

import { useEffect } from "react";

/** Registra o SW cedo no painel (necessário para push no PWA). */
export function RegisterPainelServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // ignore — pode falhar fora de HTTPS
    });
  }, []);
  return null;
}
