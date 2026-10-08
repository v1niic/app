import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { playAlertBeep } from "@/hooks/useRide";
import type { RideState } from "@/hooks/useRide";
import { HAZARD_SPOKEN } from "@/lib/hazards";
import { evaluateHazards, nextAlertState } from "@/lib/proximity";
import type { Hazard, HazardLevel } from "@/lib/proximity";
import type { BikeLane, Obstacle } from "@/lib/types";

/** Por quanto tempo um alerta dispensado fica quieto (o ciclista já viu). */
const DISMISS_MS = 3 * 60_000;

function speak(text: string): void {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel(); // não acumula avisos atrasados
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    // voz indisponível — o alerta visual e o som seguem
  }
}

function roundForSpeech(distM: number, level: HazardLevel): number {
  const step = level === "danger" ? 10 : 50;
  return Math.max(step, Math.round(distM / step) * step);
}

interface Options {
  ride: RideState;
  obstacles: Obstacle[];
  lanes: BikeLane[];
  /** liga/desliga o beep e a voz (a vibração e o visual continuam) */
  soundOn: boolean;
}

/**
 * Vigia os perigos em volta do ciclista em tempo real: calcula distância/direção a cada posição do GPS,
 * avisa uma vez a cada nível (atenção a ~250 m, perigo a ~100 m) com som, voz e vibração, e expõe o
 * perigo principal para o cartão de alerta e os níveis para destacar os ícones no mapa.
 */
export function useHazardWatch({ ride, obstacles, lanes, soundOn }: Options) {
  const { pos, heading, speedKmh, riding } = ride;

  const hazards = useMemo<Hazard[]>(
    () => (riding && pos ? evaluateHazards({ pos, heading, speedKmh, obstacles, lanes }) : []),
    [riding, pos, heading, speedKmh, obstacles, lanes],
  );

  const prevRef = useRef<Map<string, HazardLevel>>(new Map());
  const [levels, setLevels] = useState<Record<string, HazardLevel>>({});
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  const dismissedRef = useRef(dismissed);
  useEffect(() => {
    dismissedRef.current = dismissed;
  }, [dismissed]);
  const soundRef = useRef(soundOn);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    const { events, next } = nextAlertState(prevRef.current, hazards);
    prevRef.current = next;

    // só atualiza o estado se os níveis mudaram de fato (evita renderizar a cada tick de GPS)
    setLevels((cur) => {
      const keys = Object.keys(cur);
      if (keys.length === next.size && keys.every((k) => cur[k] === next.get(k))) return cur;
      return Object.fromEntries(next);
    });

    if (events.length === 0) return;
    // vários ao mesmo tempo: avisa só o mais grave e, empatando, o mais próximo
    const severity = (l: HazardLevel) => (l === "danger" ? 2 : 1);
    const top = [...events].sort(
      (a, b) => severity(b.level) - severity(a.level) || a.hazard.distM - b.hazard.distM,
    )[0];
    const { hazard, level } = top;
    const now = Date.now();
    if ((dismissedRef.current[hazard.obstacle.id] ?? 0) > now) return;

    navigator.vibrate?.(level === "danger" ? [220, 90, 220, 90, 220] : [140]);
    if (soundRef.current) {
      playAlertBeep(level === "danger" ? "danger" : "warn");
      speak(`${HAZARD_SPOKEN[hazard.obstacle.type]} a ${roundForSpeech(hazard.distM, level)} metros`);
    }
  }, [hazards]);

  // ao encerrar o pedal, zera tudo (e para a voz)
  useEffect(() => {
    if (riding) return;
    prevRef.current = new Map();
    setLevels({});
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // sem voz
    }
  }, [riding]);

  const dismiss = useCallback((id: string) => {
    setDismissed((d) => ({ ...d, [id]: Date.now() + DISMISS_MS }));
  }, []);

  /** perigo que merece o cartão: o mais próximo à frente em atenção/perigo e não dispensado */
  const primary = useMemo<Hazard | null>(() => {
    const now = Date.now();
    return (
      hazards.find(
        (h) => (h.level === "warn" || h.level === "danger") && (dismissed[h.obstacle.id] ?? 0) <= now,
      ) ?? null
    );
  }, [hazards, dismissed]);

  /** quantos outros perigos aparecem logo à frente, além do principal */
  const othersAhead = useMemo(
    () => hazards.filter((h) => h.ahead && h.level && h.obstacle.id !== primary?.obstacle.id).length,
    [hazards, primary],
  );

  return { hazards, levels, primary, othersAhead, dismiss };
}

export type HazardWatch = ReturnType<typeof useHazardWatch>;
