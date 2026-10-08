import { HAZARD_PATHS, hazardColor } from "@/lib/hazards";
import type { ObstacleType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  type: ObstacleType;
  /** lado do quadrado em px (o losango é desenhado dentro dele) */
  size?: number;
  className?: string;
}

/** Placa de advertência do perigo — a mesma do mapa, para o ciclista reconhecer no cartão de alerta e nos filtros. */
export default function HazardIcon({ type, size = 40, className }: Props) {
  const glyph = Math.round(size * 0.52);
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size * 1.2, height: size * 1.2 }}
      aria-hidden="true"
    >
      <span
        className="grid place-items-center border-2 border-white shadow-lg"
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.27),
          background: hazardColor(type),
          rotate: "45deg",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={glyph}
          height={glyph}
          fill="none"
          stroke="#fff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ rotate: "-45deg" }}
        >
          {HAZARD_PATHS[type].map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </span>
    </span>
  );
}
