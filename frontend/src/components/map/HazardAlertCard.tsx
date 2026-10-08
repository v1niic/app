import { X } from "lucide-react";
import type { CSSProperties } from "react";

import HazardIcon from "@/components/map/HazardIcon";
import { formatDistance } from "@/hooks/useNavigation";
import { SEVERITY_COLORS } from "@/lib/hazards";
import { WARN_M } from "@/lib/proximity";
import type { Hazard } from "@/lib/proximity";
import { OBSTACLE_TYPES, SEVERITY_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  hazard: Hazard;
  /** outros perigos logo à frente, além deste */
  othersAhead: number;
  onDismiss: () => void;
  onFocus: () => void;
}

/** Texto de direção a partir do ângulo relativo ao rumo. */
function side(rel: number | null): string {
  if (rel === null) return "à frente";
  if (Math.abs(rel) < 20) return "à frente";
  return rel > 0 ? "à direita" : "à esquerda";
}

/**
 * Cartão que aparece sozinho quando o ciclista se aproxima de um perigo (≤ 250 m): placa grande,
 * distância em tempo real, tempo até chegar e uma barra que enche conforme ele chega perto.
 */
export default function HazardAlertCard({ hazard, othersAhead, onDismiss, onFocus }: Props) {
  const { obstacle, distM, level, relAngle, etaS, laneName } = hazard;
  const danger = level === "danger";
  // 0 → no limite de atenção (250 m), 1 → em cima do perigo
  const fill = Math.max(0.04, Math.min(1, 1 - (distM - 10) / (WARN_M - 10)));
  const meta = OBSTACLE_TYPES[obstacle.type];

  return (
    <div
      role="alert"
      aria-live={danger ? "assertive" : "polite"}
      data-testid="gps-proximity-alert"
      data-level={level ?? undefined}
      className={cn(
        "relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md",
        danger ? "animate-pulse border-red-500/80 bg-red-950/92" : "border-amber-400/50 bg-slate-900/92",
      )}
    >
      <div className="flex items-center gap-3 py-3 pl-3 pr-2">
        <button type="button" onClick={onFocus} aria-label="Ver no mapa" className="shrink-0 rounded-xl p-1">
          <HazardIcon type={obstacle.type} size={34} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-base font-bold text-white">
            {danger ? "Cuidado: " : ""}
            {meta.label} {side(relAngle)}
          </p>
          <p className="truncate text-xs text-slate-300">
            {laneName ? `${laneName} · ` : ""}
            gravidade{" "}
            <span style={{ color: SEVERITY_COLORS[obstacle.severity] }} className="font-semibold">
              {SEVERITY_LABELS[obstacle.severity].toLowerCase()}
            </span>
            {othersAhead > 0 ? ` · +${othersAhead} à frente` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-2xl font-bold leading-none text-white" data-testid="hazard-distance">
            {formatDistance(Math.round(distM / (danger ? 5 : 10)) * (danger ? 5 : 10))}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{etaS !== null ? `~${Math.max(1, Math.round(etaS))} s` : "perto"}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dispensar alerta"
          data-testid="hazard-dismiss"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1 w-full bg-white/10" aria-hidden="true">
        <div
          className={cn("h-full origin-left transition-transform duration-500", danger ? "bg-red-500" : "bg-amber-400")}
          style={{ transform: `scaleX(${fill})` } as CSSProperties}
        />
      </div>
    </div>
  );
}
