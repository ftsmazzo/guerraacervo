"use client";

import { useEffect, useState } from "react";

/**
 * True no celular / PWA standalone — experiência de prateleira (sem QR desktop).
 */
export function usePocketMode() {
  const [pocket, setPocket] = useState(false);

  useEffect(() => {
    const mqNarrow = window.matchMedia("(max-width: 767px)");
    const mqStandalone = window.matchMedia("(display-mode: standalone)");
    const mqIosStandalone = window.matchMedia("(display-mode: fullscreen)");

    const sync = () => {
      const standalone =
        mqStandalone.matches ||
        mqIosStandalone.matches ||
        // iOS Safari "Add to Home Screen"
        Boolean(
          "standalone" in navigator &&
            (navigator as Navigator & { standalone?: boolean }).standalone,
        );
      setPocket(mqNarrow.matches || standalone);
    };

    sync();
    mqNarrow.addEventListener("change", sync);
    mqStandalone.addEventListener("change", sync);
    return () => {
      mqNarrow.removeEventListener("change", sync);
      mqStandalone.removeEventListener("change", sync);
    };
  }, []);

  return pocket;
}
