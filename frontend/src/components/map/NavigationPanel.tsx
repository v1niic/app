import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Bike,
  Check,
  Clock,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Search,
  Square,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistance, formatDuration } from "@/hooks/useNavigation";
import type { NavigationState } from "@/hooks/useNavigation";
import type { RideState } from "@/hooks/useRide";
import { OBSTACLE_TYPES, formatKm } from "@/lib/types";
import type { BikeLane, Obstacle, RouteStep } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Horário previsto de chegada (HH:mm) a partir de agora + `seconds`. */
function etaClock(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function ManeuverIcon({ step, className }: { step: RouteStep | null; className?: string }) {
  if (!step) return <ArrowUp className={className} />;
  if (step.type === "arrive") return <Flag className={className} />;
  switch (step.modifier) {
    case "left":
    case "sharp left":
    case "uturn":
      return <CornerUpLeft className={className} />;
    case "right":
    case "sharp right":
      return <CornerUpRight className={className} />;
    case "slight left":
      return <ArrowUpLeft className={className} />;
    case "slight right":
      return <ArrowUpRight className={className} />;
    default:
      return <ArrowUp className={className} />;
  }
}

interface BannerProps {
  nav: NavigationState;
  ride: RideState;
  /** obstáculo a menos de 200 m (alerta de proximidade) */
  alert: { obstacle: Obstacle; distM: number } | null;
}

/** Faixa superior durante a navegação: próxima manobra + distância (vira alerta vermelho perto de obstáculos). */
export function ManeuverBanner({ nav, ride, alert }: BannerProps) {
  const alerting = !!alert;
  return (
    <div
      className={cn(
        "absolute left-3 right-3 top-3 z-[1180] flex items-center gap-3 rounded-2xl border px-3 py-3 shadow-2xl backdrop-blur-md md:left-[404px]",
        alerting ? "animate-pulse border-red-500/70 bg-red-950/90" : "border-emerald-500/30 bg-slate-900/92",
      )}
      data-testid={alerting ? "gps-proximity-alert" : "nav-banner"}
    >
      <span
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
          alerting ? "bg-red-500 text-white" : "bg-emerald-500 text-[#022C22]",
        )}
      >
        {alerting ? (
          <TriangleAlert className="h-7 w-7" />
        ) : (
          <ManeuverIcon step={nav.nextStep} className="h-7 w-7" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {alert ? (
          <>
            <p className="truncate font-heading text-base font-bold text-white">
              Atenção: {OBSTACLE_TYPES[alert.obstacle.type].label}
            </p>
            <p className="text-xs text-red-200">a {Math.round(alert.distM)} m — reduza a velocidade</p>
          </>
        ) : (
          <>
            <p className="truncate font-heading text-base font-bold text-white" data-testid="nav-instruction">
              {nav.nextStep ? nav.nextStep.instruction : "Siga a rota"}
            </p>
            <p className="text-xs text-slate-300">
              {nav.nextStep ? `em ${formatDistance(nav.distToNextM)}` : `${formatDistance(nav.remainingM)} até o destino`}
            </p>
          </>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-xl font-bold leading-none text-white">{Math.round(ride.speedKmh)}</p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">km/h</p>
      </div>
    </div>
  );
}

interface PanelProps {
  nav: NavigationState;
  ride: RideState;
  lanes: BikeLane[];
  /** posição do painel no encaixe (0 = recolhido) — mostra mais conteúdo quando expandido */
  sheetIndex: number;
}

/** Conteúdo do painel inferior conforme a fase: busca de destino → prévia da rota → guiando → chegada. */
export default function NavigationPanel({ nav, ride, lanes, sheetIndex }: PanelProps) {
  const [query, setQuery] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void nav.search(query);
  };

  // ---- chegada ----
  if (nav.phase === "arrived") {
    return (
      <div className="space-y-3 text-center" data-testid="nav-arrived">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-[#022C22]">
          <Check className="h-7 w-7" />
        </span>
        <p className="font-heading text-lg font-bold text-white">Você chegou!</p>
        <p className="text-xs text-slate-400">{nav.destination?.name}</p>
        <Button className="w-full" onClick={nav.finish} data-testid="nav-finish">
          Concluir e salvar pedalada
        </Button>
      </div>
    );
  }

  // ---- guiando ----
  if (nav.phase === "navigating") {
    return (
      <div className="space-y-3" data-testid="nav-active">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-heading text-2xl font-bold text-white" data-testid="nav-eta">
              {formatDuration(nav.remainingS)}
            </p>
            <p className="text-xs text-slate-400">
              {formatDistance(nav.remainingM)} · chega às {etaClock(nav.remainingS)}
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={nav.finish} data-testid="nav-stop">
            <Square className="h-3.5 w-3.5" /> Encerrar
          </Button>
        </div>
        {nav.routeObstacleIds.length > 0 && (
          <p className="flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            {nav.routeObstacleIds.length} alerta(s) no seu caminho
          </p>
        )}
        {sheetIndex > 0 && nav.route && (
          <ol className="space-y-1 pt-1" data-testid="nav-steps">
            {nav.route.steps.map((s, i) => (
              <li key={`${i}-${s.lat}-${s.lng}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-slate-300">
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
    );
  }

  // ---- prévia da rota ----
  if (nav.phase === "preview") {
    const alerts = nav.routeObstacleIds.length;
    return (
      <div className="space-y-3" data-testid="nav-preview">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destino</p>
            <p className="truncate font-heading text-base font-bold text-white">{nav.destination?.name}</p>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={nav.cancel} aria-label="Cancelar rota" data-testid="nav-cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {nav.loading || !nav.route ? (
          <p className="animate-pulse py-3 text-sm text-slate-400" data-testid="nav-loading">
            Traçando a melhor rota de bike…
          </p>
        ) : (
          <>
            <div className="flex items-end gap-4">
              <div>
                <p className="font-heading text-3xl font-bold text-white" data-testid="nav-eta">
                  {formatDuration(nav.route.duration_s)}
                </p>
                <p className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" /> chega às {etaClock(nav.route.duration_s)}
                </p>
              </div>
              <div>
                <p className="font-mono text-lg font-semibold text-slate-200">{formatKm(nav.route.distance_m / 1000)}</p>
                <p className="text-xs text-slate-400">distância</p>
              </div>
            </div>
            <p
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                alerts > 0
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
              )}
              data-testid="nav-route-alerts"
            >
              {alerts > 0 ? <TriangleAlert className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
              {alerts > 0 ? `${alerts} alerta(s) de obstáculo no caminho` : "Nenhum alerta de obstáculo no caminho"}
            </p>
            {nav.route.source === "straight" && (
              <p className="text-xs text-amber-300">
                O roteador de bike está indisponível — a linha é reta e não segue as ruas.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => nav.start(false)} data-testid="nav-start">
                <Navigation className="h-4 w-4" /> Iniciar
              </Button>
              <Button variant="outline" onClick={() => nav.start(true)} data-testid="nav-simulate">
                <Zap className="h-4 w-4" /> Simular
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- sem destino: busca ----
  return (
    <div className="space-y-4" data-testid="nav-search-panel">
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Para onde vamos pedalar?"
            className="h-10 pl-8"
            data-testid="nav-search-input"
            enterKeyHint="search"
          />
        </div>
        <Button type="submit" size="lg" disabled={nav.searching} data-testid="nav-search-submit">
          {nav.searching ? "…" : "Buscar"}
        </Button>
      </form>

      {nav.places.length > 0 && (
        <ul className="space-y-1" data-testid="nav-results">
          {nav.places.map((p) => (
            <li key={`${p.lat}-${p.lng}`}>
              <button
                type="button"
                onClick={() => nav.chooseDestination({ lat: p.lat, lng: p.lng, name: p.name || p.label })}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">{p.name || p.label}</span>
                  <span className="block truncate text-xs text-slate-500">{p.label}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        Dica: <strong className="text-slate-300">segure o dedo no mapa</strong> para escolher o destino ali.
      </p>

      {sheetIndex > 0 && (
        <>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Ciclovias de Fortaleza</p>
            <ul className="space-y-1">
              {lanes.map((l) => {
                const end = l.coordinates[l.coordinates.length - 1];
                if (!end) return null;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => nav.chooseDestination({ lat: end[0], lng: end[1], name: l.name })}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800"
                      data-testid={`nav-lane-${l.id}`}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          l.kind === "ciclovia" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300",
                        )}
                      >
                        <RouteIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{l.name}</span>
                        <span className="block text-xs text-slate-500">
                          {l.kind === "ciclovia" ? "Ciclovia" : "Ciclofaixa"} · {formatKm(l.length_km)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-700/70 bg-slate-800/40 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Bike className="h-4 w-4 text-emerald-400" /> Pedal livre
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {ride.riding
                ? `${Math.round(ride.speedKmh)} km/h · ${formatKm(ride.sessionKm)} no pedal`
                : "Registra seus km e avisa de obstáculos num raio de 200 m, sem destino."}
            </p>
            <Button
              size="sm"
              className="mt-2 w-full"
              variant={ride.riding ? "destructive" : "default"}
              onClick={ride.toggle}
              data-testid="free-ride-toggle"
            >
              {ride.riding ? "Encerrar pedal" : "Iniciar pedal livre"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
