import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Minimize2, Square, TriangleAlert } from "lucide-react";

import { ManeuverIcon, etaClock } from "@/components/map/NavigationPanel";
import { formatDistance, formatDuration } from "@/hooks/useNavigation";
import type { NavigationState } from "@/hooks/useNavigation";
import { BOTTOM_BAR_PX } from "@/components/map/BottomSheet";
import { cn } from "@/lib/utils";

interface Props {
  nav: NavigationState;
  /** avisa a altura ocupada (px, a partir do rodapé do mapa) para os botões flutuantes subirem junto */
  onInsetChange: (px: number) => void;
}

/** Anel de progresso: quanto da rota já foi percorrido. */
function Ring({ pct, children }: { pct: number; children: React.ReactNode }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="4" className="stroke-slate-700" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className="stroke-emerald-400 transition-[stroke-dashoffset] duration-700"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0.02, Math.min(1, pct)))}
        />
      </svg>
      <span className="relative text-center leading-none">{children}</span>
    </span>
  );
}

/**
 * Bolha flutuante da viagem: tempo e km que faltam, hora de chegada e "Encerrar".
 * Toque na bolha para ver as próximas curvas; o botão de minimizar a transforma numa bolinha redonda.
 */
export default function NavBubble({ nav, onInsetChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [mini, setMini] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const total = nav.route?.distance_m ?? 0;
  const pct = total > 0 ? 1 - nav.remainingM / total : 0;
  const minutes = Math.max(1, Math.round(nav.remainingS / 60));
  const alerts = nav.routeObstacleIds.length;

  // mede a bolha para os botões do mapa ficarem logo acima dela (no desktop o painel é lateral: sem inset)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const report = () => {
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      onInsetChange(desktop ? 0 : el.offsetHeight + BOTTOM_BAR_PX + 12);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onInsetChange, mini, expanded]);

  // "Encerrar" pede um segundo toque (evita encerrar sem querer com a bike em movimento)
  useEffect(() => {
    if (!confirmStop) return;
    const t = setTimeout(() => setConfirmStop(false), 3500);
    return () => clearTimeout(t);
  }, [confirmStop]);

  const stop = () => {
    if (confirmStop) nav.finish();
    else setConfirmStop(true);
  };

  if (mini) {
    return (
      <div
        ref={boxRef}
        className="absolute bottom-[calc(3.5rem+12px)] right-3 z-[1150] md:bottom-6 md:left-3 md:right-auto"
        data-testid="nav-active"
      >
        <button
          type="button"
          onClick={() => setMini(false)}
          aria-label="Abrir detalhes da viagem"
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-emerald-400/50 bg-slate-900/90 shadow-[0_10px_34px_rgba(16,185,129,0.35)] backdrop-blur-md"
          data-testid="nav-bubble-mini"
        >
          <Ring pct={pct}>
            <span className="block font-mono text-base font-bold text-white" data-testid="nav-eta">{minutes}</span>
            <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400">min</span>
          </Ring>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      className="absolute bottom-[calc(3.5rem+12px)] left-3 right-3 z-[1150] md:bottom-6 md:right-auto md:w-[380px]"
      data-testid="nav-active"
    >
      <div className="overflow-hidden rounded-[28px] border border-emerald-400/40 bg-slate-900/90 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(16,185,129,0.08),0_0_36px_rgba(16,185,129,0.18)] backdrop-blur-xl">
        <div className="flex items-center gap-3 p-2.5 pr-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label="Ver as próximas curvas"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left"
            data-testid="nav-bubble-toggle"
          >
            <Ring pct={pct}>
              <span className="block font-mono text-base font-bold text-white">{minutes}</span>
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400">min</span>
            </Ring>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-lg font-bold leading-tight text-white" data-testid="nav-eta">
                {formatDuration(nav.remainingS)}
              </span>
              <span className="block truncate text-xs text-slate-300">
                <b className="font-semibold text-emerald-300">{formatDistance(nav.remainingM)}</b> · chega às {etaClock(nav.remainingS)}
              </span>
              {alerts > 0 && (
                <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-orange-300">
                  <TriangleAlert className="h-3 w-3" /> {alerts} alerta{alerts > 1 ? "s" : ""} no caminho
                </span>
              )}
            </span>
            {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />}
          </button>

          <button
            type="button"
            onClick={() => setMini(true)}
            aria-label="Minimizar em bolinha"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:text-white"
            data-testid="nav-bubble-minimize"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={stop}
            aria-label="Encerrar viagem"
            className={cn(
              "flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-red-500 text-sm font-bold text-white shadow-lg transition-all hover:bg-red-400 active:scale-95",
              confirmStop ? "w-[104px] px-3" : "w-12",
            )}
            data-testid="nav-stop"
          >
            <Square className="h-4 w-4 fill-current" />
            {confirmStop && <span>Confirmar</span>}
          </button>
        </div>

        {expanded && nav.route && (
          <ol className="max-h-48 space-y-0.5 overflow-y-auto overscroll-contain border-t border-slate-700/60 px-2.5 py-2" data-testid="nav-steps">
            {nav.route.steps.map((s, i) => (
              <li key={`${i}-${s.lat}-${s.lng}`} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 text-sm text-slate-300">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-200">
                  <ManeuverIcon step={s} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate">{s.instruction}</span>
                {s.distance_m > 0 && <span className="text-xs text-slate-500">{formatDistance(s.distance_m)}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
