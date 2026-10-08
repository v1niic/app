import { Gauge, Navigation, Radar, Square, Volume2, VolumeX, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RideState } from "@/hooks/useRide";
import { WATCH_M } from "@/lib/proximity";
import type { Hazard } from "@/lib/proximity";
import { formatKm } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  ride: RideState;
  hazards: Hazard[];
  /** total de alertas visíveis no mapa */
  totalAlerts: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onStartDemo: () => void;
}

/**
 * Faixa de status do radar. Parado: quantos alertas há no mapa e atalhos para ligar o GPS/rota demo.
 * Pedalando: velocidade, km, quantos perigos no raio de 500 m e controle do som.
 */
export default function MapHud({ ride, hazards, totalAlerts, soundOn, onToggleSound, onStartDemo }: Props) {
  const near = hazards.filter((h) => h.ahead).length;

  if (!ride.riding) {
    return (
      <div
        className="flex items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-2 pl-3 shadow-xl backdrop-blur-md"
        data-testid="gps-hud"
      >
        <Radar className="h-4 w-4 shrink-0 text-emerald-400" />
        <p className="min-w-0 flex-1 truncate text-xs text-slate-300">
          <strong className="text-white">{totalAlerts}</strong> {totalAlerts === 1 ? "perigo mapeado" : "perigos mapeados"}
        </p>
        <Button size="sm" onClick={ride.toggle} data-testid="gps-toggle">
          <Navigation className="h-3.5 w-3.5" /> Radar
        </Button>
        <Button size="sm" variant="outline" onClick={onStartDemo} data-testid="gps-demo" aria-label="Rota demo">
          <Zap className="h-3.5 w-3.5" /> Demo
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-slate-900/90 p-2 pl-3 shadow-xl backdrop-blur-md"
      data-testid="gps-hud"
    >
      <span className="flex items-center gap-2" data-testid="gps-status">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[11px] font-semibold text-emerald-300">{ride.demo ? "Simulação" : "Ao vivo"}</span>
      </span>

      <span className="flex items-baseline gap-1" title="Velocidade">
        <Gauge className="h-3.5 w-3.5 self-center text-slate-400" />
        <span className="font-mono text-xl font-bold leading-none text-white" data-testid="gps-speed">
          {Math.round(ride.speedKmh)}
        </span>
        <span className="text-[10px] text-slate-400">km/h</span>
      </span>

      <span className="font-mono text-sm text-slate-300" data-testid="gps-distance">
        {formatKm(ride.sessionKm)}
      </span>

      <span
        className={cn(
          "ml-auto hidden items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium sm:flex",
          near > 0 ? "bg-amber-400/15 text-amber-200" : "bg-slate-800 text-slate-400",
        )}
        data-testid="gps-nearest"
      >
        {near > 0 ? `${near} no radar de ${WATCH_M} m` : "Caminho livre"}
      </span>

      <div className="ml-auto flex items-center gap-1 sm:ml-0">
        <button
          type="button"
          onClick={onToggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? "Silenciar avisos" : "Ativar avisos sonoros"}
          data-testid="hazard-sound-toggle"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 hover:bg-white/10"
        >
          {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-slate-500" />}
        </button>
        <Button size="sm" variant="destructive" onClick={ride.toggle} data-testid="gps-stop">
          <Square className="h-3.5 w-3.5" /> Parar
        </Button>
      </div>
    </div>
  );
}
