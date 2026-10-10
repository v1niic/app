import { useEffect } from "react";

/**
 * Mantém a tela ligada enquanto `active` (pedalando/navegando). O navegador solta a trava sozinho quando o
 * app vai para segundo plano; ao voltar, pedimos de novo. Sem suporte (ex.: Safari antigo) simplesmente não faz nada.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
      } catch {
        // bateria fraca / permissão negada: seguimos sem a trava
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
