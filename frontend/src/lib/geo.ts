// Geometria leve para o mapa (sem dependências — roda no navegador e em testes).

export interface LatLng {
  lat: number;
  lng: number;
}

/** Distância em metros (Haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Rumo inicial de a para b em graus (0 = norte, sentido horário). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Diferença angular com sinal, em (-180, 180]: positivo = `to` está à direita de `from`. */
export function angleDiff(from: number, to: number): number {
  const d = (((to - from) % 360) + 540) % 360;
  return d - 180;
}

/** Distância (m) de um ponto até a polilinha [lat, lng][] — projeção em plano local, suficiente em escala de cidade. */
export function distToPolylineM(p: LatLng, line: [number, number][]): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY;
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  if (line.length === 1) return Math.hypot((line[0][1] - p.lng) * kx, (line[0][0] - p.lat) * ky);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][1] - p.lng) * kx;
    const ay = (line[i][0] - p.lat) * ky;
    const bx = (line[i + 1][1] - p.lng) * kx;
    const by = (line[i + 1][0] - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}
