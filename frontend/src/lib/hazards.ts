import { OBSTACLE_TYPES } from "./types";
import type { ObstacleType, Severity } from "./types";

/**
 * Desenho de cada perigo (viewBox 24×24, só traço), na linguagem das placas de advertência.
 * Fica em dados puros para servir tanto aos marcadores do Leaflet (string HTML) quanto aos componentes React.
 */
export const HAZARD_PATHS: Record<ObstacleType, string[]> = {
  // buraco: cratera no asfalto com "raios" de alerta
  buraco: ["M3.5 16a8.5 4 0 1 0 17 0a8.5 4 0 1 0-17 0", "M7 11.5 8.8 7.8", "M12 10.5V6.5", "M17 11.5 15.2 7.8"],
  // obra: cone de sinalização
  obra: ["M12 3.5 7.6 18.5h8.8L12 3.5Z", "M9.9 10h4.2", "M8.7 14.2h6.6", "M4 20.5h16"],
  // trecho inacabado: a pista converge e termina numa barreira
  trecho_inacabado: ["M7 21 9.8 9.5", "M17 21l-2.8-11.5", "M4.5 5.5h15", "M7.5 5.5V9", "M12 5.5V9", "M16.5 5.5V9"],
  // falta de iluminação: lâmpada riscada
  falta_iluminacao: [
    "M12 3a5.5 5.5 0 0 0-3.3 9.9c.6.5 1 1.2 1 2.1h4.6c0-.9.4-1.6 1-2.1A5.5 5.5 0 0 0 12 3Z",
    "M9 18.5h6",
    "M10 21.5h4",
    "M4 4l16 16",
  ],
  // outros: exclamação
  outros: ["M12 4v10.5", "M12 19h.01"],
};

/** Nome curto para os filtros e a lista. */
export const HAZARD_SHORT: Record<ObstacleType, string> = {
  buraco: "Buraco",
  obra: "Obra",
  trecho_inacabado: "Inacabado",
  falta_iluminacao: "Sem luz",
  outros: "Outro",
};

/** Como o aviso falado nomeia cada perigo. */
export const HAZARD_SPOKEN: Record<ObstacleType, string> = {
  buraco: "Buraco",
  obra: "Obra na pista",
  trecho_inacabado: "Trecho inacabado",
  falta_iluminacao: "Trecho sem iluminação",
  outros: "Obstáculo",
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  baixa: "#FBBF24",
  media: "#F97316",
  alta: "#EF4444",
};

export function hazardColor(type: ObstacleType): string {
  return OBSTACLE_TYPES[type].color;
}

/** SVG do ícone como string (para `L.divIcon`). Herda a cor do texto (`currentColor`). */
export function hazardSvg(type: ObstacleType, size = 18): string {
  const body = HAZARD_PATHS[type].map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
