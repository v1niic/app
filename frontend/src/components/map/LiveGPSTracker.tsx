import { Navigation, Square, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RideState } from "@/hooks/useRide";
import { OBSTACLE_TYPES, formatKm } from "@/lib/types";
import type { Obstacle } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  ride: RideState;
  nearest: { obstacle: Obstacle; distM: number } | null;
  onStartDemo: () => void;
}

/** HUD tático do modo GPS: velocidade, distância do pedal e alerta de proximidade (< 200 m). */
export default function LiveGPSTracker({ ride, nearest, onStartDemo }: Props) {
  const alerting = ride.riding && !!nearest && nearest.distM < 200;

  return (
    <div
      className="w-[290px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-emerald-500/20 bg-slate-900/80 p-4 shadow-2xl backdrop-blur-md"
      data-testid="gps-hud"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-300">
          <span
            className={cn("h-2 w-2 rounded-full", ride.riding ? "animate-pulse bg-emerald-400" : "bg-slate-600")}
          />
          {ride.demo ? "GPS · Demo" : ride.riding ? "GPS · Ao vivo" : "Modo GPS"}
        </span>
        {ride.riding && (
          <span className="font-mono text-xs text-emerald-400" data-testid="gps-status">
            {ride.demo ? "simulação" : "ativo"}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="font-mono text-3xl font-bold tracking-tight text-white" data-testid="gps-speed">
            {ride.speedKmh.toFixed(0)}
            <span className="ml-1 text-xs font-semibold text-slate-400">km/h</span>
          </p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Velocidade</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-bold tracking-tight text-white" data-testid="gps-distance">
            {formatKm(ride.sessionKm)}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">No pedal</p>
        </div>
      </div>

      <div
        className={cn(
          "mt-3 rounded-lg border px-3 py-2 text-xs",
          alerting
            ? "animate-pulse border-red-500/60 bg-red-500/10 text-red-200"
            : "border-slate-700 bg-slate-800/50 text-slate-300",
        )}
        data-testid={alerting ? "gps-proximity-alert" : "gps-nearest"}
      >
        {alerting && nearest ? (
          <span>
            Atenção: {OBSTACLE_TYPES[nearest.obstacle.type].label} a {Math.round(nearest.distM)} m
          </span>
        ) : nearest ? (
          <span>
            Próximo alerta: {OBSTACLE_TYPES[nearest.obstacle.type].label} a {Math.round(nearest.distM)} m
          </span>
        ) : (
          <span>Nenhum obstáculo mapeado por perto.</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" variant={ride.riding ? "destructive" : "default"} onClick={ride.toggle} data-testid="gps-toggle">
          {ride.riding ? (
            <>
              <Square className="h-3.5 w-3.5" /> Encerrar
            </>
          ) : (
            <>
              <Navigation className="h-3.5 w-3.5" /> Iniciar
            </>
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={onStartDemo} disabled={ride.riding} data-testid="gps-demo">
          <Zap className="h-3.5 w-3.5" /> Rota demo
        </Button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        {ride.riding
          ? "Ao encerrar, seus km viram XP nas missões."
          : "O GPS registra sua rota e avisa quando há obstáculo a menos de 200 m."}
      </p>
    </div>
  );
}
