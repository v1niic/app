import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Altura da barra de abas fixa no rodapé do celular (Navbar) — o painel fica logo acima dela. */
export const BOTTOM_BAR_PX = 56;
/** Espaço reservado no celular: navbar (56) + barra inferior (56) + respiro (16). */
const RESERVED_PX = 128;

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

interface BottomSheetProps {
  /** alturas (px) dos pontos de ancoragem, em ordem crescente (só no celular; no desktop vira painel lateral) */
  snaps: number[];
  index: number;
  onIndexChange: (index: number) => void;
  /** distância (px) do rodapé do mapa até o topo do painel — para posicionar botões flutuantes acima dele */
  onInsetChange?: (px: number) => void;
  children: ReactNode;
  className?: string;
  testId?: string;
}

/**
 * Painel inferior arrastável (estilo Uber/99): puxe a alça para cima/baixo e ele encaixa no ponto mais próximo,
 * levando em conta a velocidade do gesto. Toque na alça alterna entre os pontos. No desktop é um painel à esquerda.
 */
export default function BottomSheet({
  snaps,
  index,
  onIndexChange,
  onInsetChange,
  children,
  className,
  testId,
}: BottomSheetProps) {
  const desktop = useIsDesktop();
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(
    null,
  );

  const maxH = Math.max(160, (typeof window !== "undefined" ? window.innerHeight : 800) - RESERVED_PX);
  const snapsPx = useMemo(() => snaps.map((s) => Math.min(s, maxH)), [snaps, maxH]);
  const lastIdx = snapsPx.length - 1;
  const height = dragH ?? snapsPx[Math.max(0, Math.min(index, lastIdx))] ?? 160;

  useEffect(() => {
    onInsetChange?.(desktop ? 0 : height + BOTTOM_BAR_PX);
  }, [height, desktop, onInsetChange]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startH: height, lastY: e.clientY, lastT: performance.now(), v: 0, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    d.v = (d.lastY - e.clientY) / Math.max(1, now - d.lastT); // px/ms, positivo = subindo
    d.lastY = e.clientY;
    d.lastT = now;
    if (Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    const next = Math.max(snapsPx[0], Math.min(snapsPx[lastIdx], d.startH + (d.startY - e.clientY)));
    setDragH(next);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // toque simples na alça: sobe um nível (ou volta ao menor, se já estiver no topo)
      setDragH(null);
      onIndexChange(index >= lastIdx ? 0 : index + 1);
      return;
    }
    const projected = height + d.v * 180; // inércia: continua um pouco na direção do gesto
    let best = 0;
    for (let i = 1; i <= lastIdx; i++) {
      if (Math.abs(snapsPx[i] - projected) < Math.abs(snapsPx[best] - projected)) best = i;
    }
    setDragH(null);
    onIndexChange(best);
  };

  return (
    <div
      data-testid={testId}
      style={desktop ? undefined : { height }}
      className={cn(
        "absolute inset-x-0 bottom-14 z-[1150] flex flex-col overflow-hidden rounded-t-3xl border border-b-0 border-slate-700/70 bg-slate-900/95 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md",
        dragH === null && "transition-[height] duration-300 ease-out",
        "md:inset-x-auto md:bottom-auto md:left-3 md:top-3 md:max-h-[calc(100%-1.5rem)] md:w-[380px] md:rounded-2xl md:border-b md:shadow-2xl",
        className,
      )}
    >
      <div
        className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing md:hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="sheet-handle"
        role="button"
        aria-label="Arraste para expandir ou recolher o painel"
      >
        <span className="h-1.5 w-11 rounded-full bg-slate-600" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1 md:pt-4">{children}</div>
    </div>
  );
}
