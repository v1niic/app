import { angleDiff, bearingDeg, distToPolylineM, distanceM } from "./geo";
import type { LatLng } from "./geo";
import type { BikeLane, Obstacle } from "./types";

/** observar = no radar · atenção = a caminho · perigo = quase em cima */
export type HazardLevel = "watch" | "warn" | "danger";

export const WATCH_M = 500;
export const WARN_M = 250;
export const DANGER_M = 100;
/** Folga antes de rebaixar o nível — evita o alerta "piscar" por causa do ruído do GPS. */
export const HYSTERESIS_M = 40;
/** Abaixo disso o perigo conta como "à frente" mesmo sem saber a direção. */
const ALWAYS_AHEAD_M = 40;
/** Obstáculo a até tantos metros de uma ciclovia pertence a ela. */
export const LANE_MATCH_M = 45;
/** Cone de visão: o perigo está à frente se o rumo até ele difere menos que isso do rumo do ciclista. */
const AHEAD_CONE_DEG = 80;
/** Abaixo dessa velocidade o rumo do GPS não é confiável. */
const MIN_SPEED_KMH = 3;

export interface Hazard {
  obstacle: Obstacle;
  distM: number;
  /** nível atual (só para perigos à frente); null = fora dos raios ou ficou para trás */
  level: HazardLevel | null;
  ahead: boolean;
  /** ângulo até o perigo relativo ao rumo (negativo = esquerda); null se o rumo é desconhecido */
  relAngle: number | null;
  /** segundos até chegar, na velocidade atual; null se parado ou perigo fora do caminho */
  etaS: number | null;
  /** nome da ciclovia/ciclofaixa onde o perigo está, se houver */
  laneName: string | null;
}

const RANK: Record<HazardLevel, number> = { watch: 1, warn: 2, danger: 3 };
const LIMIT: Record<HazardLevel, number> = { watch: WATCH_M, warn: WARN_M, danger: DANGER_M };

export function levelFor(distM: number): HazardLevel | null {
  if (distM <= DANGER_M) return "danger";
  if (distM <= WARN_M) return "warn";
  if (distM <= WATCH_M) return "watch";
  return null;
}

/** Ciclovia/ciclofaixa mais próxima do obstáculo (até `maxM`), ou null. */
export function laneFor(o: Pick<Obstacle, "lat" | "lng">, lanes: BikeLane[], maxM = LANE_MATCH_M): BikeLane | null {
  let best: BikeLane | null = null;
  let bestD = maxM;
  for (const lane of lanes) {
    const d = distToPolylineM({ lat: o.lat, lng: o.lng }, lane.coordinates);
    if (d <= bestD) {
      bestD = d;
      best = lane;
    }
  }
  return best;
}

interface EvalInput {
  pos: LatLng;
  heading: number | null;
  speedKmh: number;
  obstacles: Obstacle[];
  lanes: BikeLane[];
}

/** Perigos num raio de 500 m, com distância, direção e nível. À frente primeiro, depois por distância. */
export function evaluateHazards({ pos, heading, speedKmh, obstacles, lanes }: EvalInput): Hazard[] {
  const knowsDirection = heading !== null && speedKmh >= MIN_SPEED_KMH;
  const out: Hazard[] = [];
  for (const o of obstacles) {
    if (o.status === "resolvido") continue;
    const target = { lat: o.lat, lng: o.lng };
    const dist = distanceM(pos, target);
    if (dist > WATCH_M) continue;

    const relAngle = knowsDirection ? angleDiff(heading as number, bearingDeg(pos, target)) : null;
    const ahead =
      dist <= ALWAYS_AHEAD_M || (relAngle === null ? dist <= WARN_M : Math.abs(relAngle) <= AHEAD_CONE_DEG);
    const speedMs = speedKmh / 3.6;

    out.push({
      obstacle: o,
      distM: dist,
      level: ahead ? levelFor(dist) : null,
      ahead,
      relAngle,
      etaS: ahead && speedKmh >= MIN_SPEED_KMH ? dist / speedMs : null,
      laneName: laneFor(o, lanes)?.name ?? null,
    });
  }
  out.sort((a, b) => Number(b.ahead) - Number(a.ahead) || a.distM - b.distM);
  return out;
}

export interface AlertEvent {
  hazard: Hazard;
  level: HazardLevel;
}

/**
 * Decide quando avisar: só quando um perigo SOBE de nível (observar → atenção → perigo), uma vez por nível.
 * `prev` guarda o maior nível já avisado de cada perigo; ele só é rebaixado depois de uma folga (histerese).
 */
export function nextAlertState(
  prev: ReadonlyMap<string, HazardLevel>,
  hazards: Hazard[],
): { events: AlertEvent[]; next: Map<string, HazardLevel> } {
  const events: AlertEvent[] = [];
  const next = new Map<string, HazardLevel>();
  for (const h of hazards) {
    const id = h.obstacle.id;
    const before = prev.get(id);
    let level = h.level;

    // segura o nível anterior enquanto ainda estiver dentro da folga
    if (before && (level === null || RANK[level] < RANK[before]) && h.ahead) {
      if (h.distM <= LIMIT[before] + HYSTERESIS_M) level = before;
    }
    if (!level) continue;
    next.set(id, level);

    if (level !== "watch" && (!before || RANK[level] > RANK[before])) {
      events.push({ hazard: h, level });
    }
  }
  return { events, next };
}
