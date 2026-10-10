import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { hazardColor, hazardSvg } from "@/lib/hazards";
import { WARN_M } from "@/lib/proximity";
import type { HazardLevel } from "@/lib/proximity";
import { SHOP_META, shopSvg } from "@/lib/shops";
import type { BikeLane, Obstacle, Shop } from "@/lib/types";

export interface FocusRequest {
  lat: number;
  lng: number;
  zoom?: number;
}

interface FortalezaMapProps {
  bikeLanes: BikeLane[];
  obstacles: Obstacle[];
  userPos?: { lat: number; lng: number } | null;
  /** rumo do ciclista em graus (0 = norte); gira a seta de navegação */
  heading?: number | null;
  /** modo guiado: seta de navegação, zoom alto e sem o círculo de radar */
  navigating?: boolean;
  /** a câmera acompanha o ciclista suavemente (como no Uber/99) */
  follow?: boolean;
  /** o usuário arrastou o mapa com o dedo/mouse — o pai deve desligar o `follow` */
  onUserPan?: () => void;
  /** rota (trecho que falta percorrer) em [lat, lng] */
  route?: [number, number][] | null;
  /** ids de obstáculos que ficam no caminho da rota (ganham destaque) */
  routeObstacleIds?: string[];
  /** nível de aproximação de cada perigo à frente (atenção/perigo) — o ícone cresce e pulsa */
  hazardLevels?: Record<string, HazardLevel>;
  /** perigo principal à frente: uma linha tracejada liga o ciclista até ele */
  guideTo?: { lat: number; lng: number } | null;
  /** enquadra a rota inteira na tela quando ela muda (pré-visualização) */
  fitRoute?: boolean;
  destination?: { lat: number; lng: number } | null;
  /** altura (px) coberta pelo painel inferior — usada para centralizar no espaço visível */
  bottomInset?: number;
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  /** toque simples num ponto vazio do mapa (escolher destino / reportar); arrastar e pinça não contam */
  onTap?: (lat: number, lng: number) => void;
  /** ponto tocado, marcado com um pino até o usuário decidir o que fazer */
  tapPoint?: { lat: number; lng: number } | null;
  onSelectObstacle?: (o: Obstacle) => void;
  /** borracharias, oficinas e pontos de autorreparo (ícones redondos azuis/roxos/verdes) */
  shops?: Shop[];
  onSelectShop?: (s: Shop) => void;
  focus?: FocusRequest | null;
  className?: string;
}

const FORTALEZA_CENTER: L.LatLngExpression = [-3.7319, -38.5267];
const POS_ANIM_MS = 900;

/** Menor giro entre dois ângulos — evita a seta dar a volta inteira ao passar de 359° para 1°. */
function nextAngle(prev: number, target: number): number {
  const delta = ((target - prev + 540) % 360) - 180;
  return prev + delta;
}

/**
 * Marcador em forma de placa de advertência (losango na cor do tipo, ícone do perigo dentro, haste até o ponto exato).
 * A gravidade vira o anel pulsante (alta = rápido); o nível de aproximação é aplicado depois, por classe.
 */
function obstacleIcon(o: Obstacle, onRoute: boolean): L.DivIcon {
  const route = onRoute ? " hz--route" : "";
  return L.divIcon({
    className: "vdb-marker-wrap",
    html: `<span class="hz hz--${o.severity}${route}" style="--hz:${hazardColor(o.type)}" data-testid="obstacle-marker" data-obstacle-type="${o.type}" data-obstacle-id="${o.id}"><span class="hz-post"></span><span class="hz-ring"></span><span class="hz-sign"><span class="hz-glyph">${hazardSvg(o.type, 16)}</span></span></span>`,
    iconSize: [44, 56],
    iconAnchor: [22, 54],
  });
}

/** Bolha redonda com o desenho do tipo de local; a cor diferencia de longe e o "bico" aponta o ponto exato. */
function shopIcon(shop: Shop): L.DivIcon {
  const m = SHOP_META[shop.kind];
  return L.divIcon({
    className: "vdb-marker-wrap",
    html: `<span data-testid="shop-marker" data-shop-id="${shop.id}" style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))"><span style="display:flex;height:34px;width:34px;align-items:center;justify-content:center;border-radius:9999px;border:2.5px solid #fff;background:${m.color}">${shopSvg(shop.kind, 18)}</span><span style="margin-top:-3px;height:0;width:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid #fff"></span></span>`,
    iconSize: [34, 46],
    iconAnchor: [17, 44],
  });
}

const USER_ICON = L.divIcon({
  className: "vdb-user-wrap",
  html: `<span class="vdb-nav vdb-nav--still" data-testid="gps-user-beacon"><span class="vdb-nav-pulse"></span><span class="vdb-nav-dot"></span><svg class="vdb-nav-arrow" viewBox="0 0 44 44" aria-hidden="true"><path d="M22 4 L36 38 L22 30 L8 38 Z" fill="#10B981" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/></svg></span>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

const DEST_ICON = L.divIcon({
  className: "vdb-user-wrap",
  html: `<span class="vdb-dest" data-testid="nav-destination-pin"><svg viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C8 1 2 7 2 15c0 10 14 25 14 25s14-15 14-25C30 7 24 1 16 1z" fill="#F97316" stroke="#ffffff" stroke-width="2.5"/><circle cx="16" cy="15" r="5" fill="#ffffff"/></svg></span>`,
  iconSize: [32, 42],
  iconAnchor: [16, 40],
});

const TAP_ICON = L.divIcon({
  className: "vdb-user-wrap",
  html: `<span class="vdb-tap" data-testid="map-tap-pin"><span class="vdb-tap-ring"></span><svg viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C8 1 2 7 2 15c0 10 14 25 14 25s14-15 14-25C30 7 24 1 16 1z" fill="#38BDF8" stroke="#ffffff" stroke-width="2.5"/><circle cx="16" cy="15" r="5" fill="#ffffff"/></svg></span>`,
  iconSize: [32, 42],
  iconAnchor: [16, 40],
});

/**
 * Mapa escuro de Fortaleza: ciclovias/ciclofaixas, marcadores de obstáculos, rota de navegação e o ciclista.
 * Gestos: arrastar, pinça para zoom, duplo toque (nativos do Leaflet) e toque simples para marcar um ponto.
 */
export default function FortalezaMap({
  bikeLanes,
  obstacles,
  userPos,
  heading,
  navigating,
  follow,
  onUserPan,
  route,
  routeObstacleIds,
  hazardLevels,
  guideTo,
  fitRoute,
  destination,
  bottomInset = 0,
  pickMode,
  onPick,
  onTap,
  tapPoint,
  onSelectObstacle,
  shops,
  onSelectShop,
  focus,
  className,
}: FortalezaMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lanesRef = useRef<L.LayerGroup | null>(null);
  const routeGroupRef = useRef<L.LayerGroup | null>(null);
  const obstaclesRef = useRef<L.LayerGroup | null>(null);
  const shopsLayerRef = useRef<L.LayerGroup | null>(null);
  const onSelectShopRef = useRef(onSelectShop);
  const userGroupRef = useRef<L.LayerGroup | null>(null);
  const routeCasingRef = useRef<L.Polyline | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userCircleRef = useRef<L.Circle | null>(null);
  const markersRef = useRef<Map<string, { marker: L.Marker; sig: string }>>(new Map());
  const obstacleByIdRef = useRef<Map<string, Obstacle>>(new Map());
  const guideRef = useRef<L.Polyline | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const populatedRef = useRef(false);
  const fittedRef = useRef(false);

  // valores "mais recentes" lidos dentro de handlers de longa vida
  const pickRef = useRef<{ active: boolean; cb?: (lat: number, lng: number) => void }>({ active: false });
  const onSelectRef = useRef(onSelectObstacle);
  const onTapRef = useRef(onTap);
  const tapMarkerRef = useRef<L.Marker | null>(null);
  const onUserPanRef = useRef(onUserPan);
  const followRef = useRef(!!follow);
  const navigatingRef = useRef(!!navigating);
  const insetRef = useRef(bottomInset);
  const zoomingRef = useRef(false);
  const curPosRef = useRef<L.LatLng | null>(null);
  const animRef = useRef<{ from: L.LatLng; to: L.LatLng; t0: number; raf: number | null } | null>(null);
  const angleRef = useRef(0);

  useEffect(() => {
    onSelectRef.current = onSelectObstacle;
    onSelectShopRef.current = onSelectShop;
    onTapRef.current = onTap;
    onUserPanRef.current = onUserPan;
    navigatingRef.current = !!navigating;
    insetRef.current = bottomInset;
  }, [onSelectObstacle, onSelectShop, onTap, onUserPan, navigating, bottomInset]);

  /** Centraliza o ciclista no espaço visível (acima do painel inferior; um pouco abaixo do centro ao navegar). */
  const centerOn = (ll: L.LatLng, animate: boolean, zoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    const z = zoom ?? map.getZoom();
    const shift = insetRef.current / 2 + (navigatingRef.current ? 40 : 0);
    const target = map.unproject(map.project(ll, z).subtract([0, shift]), z);
    map.setView(target, z, { animate, duration: 0.6 });
  };

  // inicializa uma única vez (StrictMode remonta — o cleanup remove o mapa)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: FORTALEZA_CENTER,
      zoom: 12,
      zoomControl: false,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      bounceAtZoomLimits: false,
    });
    // Tiles do OpenStreetMap, escurecidos por CSS (.leaflet-tile-pane) para o tema tático — sem API key.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    // No celular o zoom é por pinça/duplo toque — sem botões +/- cobrindo o mapa.
    if (!L.Browser.mobile) L.control.zoom({ position: "bottomright" }).addTo(map);

    lanesRef.current = L.layerGroup().addTo(map);
    routeGroupRef.current = L.layerGroup().addTo(map);
    shopsLayerRef.current = L.layerGroup().addTo(map); // abaixo dos perigos: o alerta sempre fica por cima
    obstaclesRef.current = L.layerGroup().addTo(map);
    userGroupRef.current = L.layerGroup().addTo(map);

    const casing = L.polyline([], { color: "#06101F", weight: 12, opacity: 0.9, lineCap: "round", lineJoin: "round" });
    const line = L.polyline([], { color: "#38BDF8", weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" });
    casing.addTo(routeGroupRef.current);
    line.addTo(routeGroupRef.current);
    routeCasingRef.current = casing;
    routeLineRef.current = line;

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (pickRef.current.active && pickRef.current.cb) pickRef.current.cb(e.latlng.lat, e.latlng.lng);
      else onTapRef.current?.(e.latlng.lat, e.latlng.lng);
    });
    // arrastar com o dedo/mouse = o usuário assumiu a câmera
    map.on("dragstart", () => {
      followRef.current = false;
      onUserPanRef.current?.();
    });
    // zoom afastado: placas menores para não cobrir o mapa
    const syncZoomClass = () => map.getContainer().classList.toggle("vdb-zoom-far", map.getZoom() < 14);
    syncZoomClass();
    map.on("zoomstart", () => {
      zoomingRef.current = true;
    });
    map.on("zoomend", () => {
      zoomingRef.current = false;
      syncZoomClass();
    });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    mapRef.current = map;

    return () => {
      const anim = animRef.current;
      if (anim?.raf) cancelAnimationFrame(anim.raf);
      animRef.current = null;
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      knownIdsRef.current = new Set();
      populatedRef.current = false;
      guideRef.current = null;
      userMarkerRef.current = null;
      userCircleRef.current = null;
      destMarkerRef.current = null;
      tapMarkerRef.current = null;
      curPosRef.current = null;
    };
  }, []);

  // ciclovias / ciclofaixas
  useEffect(() => {
    const g = lanesRef.current;
    if (!g) return;
    g.clearLayers();
    for (const lane of bikeLanes) {
      const color = lane.kind === "ciclovia" ? "#10B981" : "#38BDF8";
      // snapped === false: o servidor ainda não colou a ciclovia nas ruas (poucos pontos ligados em linha reta).
      // Desenha fraco e pontilhado em vez de um traço grosso e falso cortando quarteirões.
      const approx = lane.snapped === false;
      L.polyline(lane.coordinates as L.LatLngExpression[], {
        color,
        weight: approx ? 3 : 5,
        opacity: approx ? 0.4 : 0.8,
        lineCap: "round",
        lineJoin: "round",
        dashArray: approx ? "2 9" : lane.kind === "ciclofaixa" ? "8 8" : undefined,
      })
        .bindTooltip(
          `<strong>${lane.name}</strong><br/>${lane.kind === "ciclovia" ? "Ciclovia" : "Ciclofaixa"} · ${lane.length_km} km${approx ? "<br/><em>traçado aproximado</em>" : ""}`,
          { direction: "top" },
        )
        .addTo(g);
    }
    if (!fittedRef.current && bikeLanes.length > 0 && mapRef.current) {
      fittedRef.current = true;
      const bounds = L.latLngBounds(bikeLanes.flatMap((l) => l.coordinates as L.LatLngTuple[]));
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [bikeLanes]);

  // marcadores de obstáculos — atualização incremental (sem piscar a cada atualização de 6 s)
  useEffect(() => {
    const g = obstaclesRef.current;
    if (!g) return;
    const onRoute = new Set(routeObstacleIds ?? []);
    obstacleByIdRef.current = new Map(obstacles.map((o) => [o.id, o]));
    const seen = new Set<string>();
    for (const o of obstacles) {
      seen.add(o.id);
      const sig = `${o.type}|${o.severity}|${onRoute.has(o.id) ? 1 : 0}`;
      const existing = markersRef.current.get(o.id);
      if (existing) {
        existing.marker.setLatLng([o.lat, o.lng]);
        if (existing.sig !== sig) {
          existing.marker.setIcon(obstacleIcon(o, onRoute.has(o.id)));
          existing.sig = sig;
        }
      } else {
        const marker = L.marker([o.lat, o.lng], { icon: obstacleIcon(o, onRoute.has(o.id)) })
          .on("click", () => {
            const fresh = obstacleByIdRef.current.get(o.id);
            if (fresh) onSelectRef.current?.(fresh);
          })
          .addTo(g);
        markersRef.current.set(o.id, { marker, sig });

        // alerta reportado agora por alguém (não é a carga inicial nem um filtro reativado): anima a entrada
        if (populatedRef.current && !knownIdsRef.current.has(o.id)) {
          const el = marker.getElement()?.querySelector(".hz");
          el?.classList.add("hz--new");
          window.setTimeout(() => marker.getElement()?.querySelector(".hz")?.classList.remove("hz--new"), 4500);
        }
      }
      knownIdsRef.current.add(o.id);
    }
    for (const [id, entry] of markersRef.current) {
      if (!seen.has(id)) {
        g.removeLayer(entry.marker);
        markersRef.current.delete(id);
      }
    }
    if (obstacles.length > 0) populatedRef.current = true;
  }, [obstacles, routeObstacleIds]);

  // borracharias e oficinas: recria só quando a lista muda (são poucas e quase não mudam)
  useEffect(() => {
    const g = shopsLayerRef.current;
    if (!g) return;
    g.clearLayers();
    for (const shop of shops ?? []) {
      L.marker([shop.lat, shop.lng], { icon: shopIcon(shop), zIndexOffset: -200, keyboard: false })
        .on("click", () => onSelectShopRef.current?.(shop))
        .addTo(g);
    }
  }, [shops]);

  // nível de aproximação: a placa cresce e pulsa conforme o ciclista chega perto
  useEffect(() => {
    for (const [id, { marker }] of markersRef.current) {
      const el = marker.getElement()?.querySelector(".hz");
      if (!el) continue;
      const level = hazardLevels?.[id];
      el.classList.toggle("hz--watch", level === "watch");
      el.classList.toggle("hz--warn", level === "warn");
      el.classList.toggle("hz--danger", level === "danger");
    }
  }, [hazardLevels, obstacles, routeObstacleIds]);

  // linha tracejada do ciclista até o perigo principal à frente
  useEffect(() => {
    const g = userGroupRef.current;
    if (!g) return;
    if (!userPos || !guideTo) {
      if (guideRef.current) g.removeLayer(guideRef.current);
      guideRef.current = null;
      return;
    }
    const pts: L.LatLngExpression[] = [
      [userPos.lat, userPos.lng],
      [guideTo.lat, guideTo.lng],
    ];
    if (!guideRef.current) {
      guideRef.current = L.polyline(pts, {
        color: "#FB7185",
        weight: 3,
        opacity: 0.9,
        dashArray: "2 9",
        lineCap: "round",
        interactive: false,
      });
    } else {
      guideRef.current.setLatLngs(pts);
    }
    if (!g.hasLayer(guideRef.current)) guideRef.current.addTo(g);
  }, [userPos, guideTo]);

  // pino do ponto tocado
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tapPoint) {
      if (!tapMarkerRef.current) {
        tapMarkerRef.current = L.marker([tapPoint.lat, tapPoint.lng], {
          icon: TAP_ICON,
          zIndexOffset: 900,
          interactive: false,
          keyboard: false,
        }).addTo(map);
      } else {
        tapMarkerRef.current.setLatLng([tapPoint.lat, tapPoint.lng]);
      }
    } else if (tapMarkerRef.current) {
      tapMarkerRef.current.remove();
      tapMarkerRef.current = null;
    }
  }, [tapPoint]);

  // rota de navegação + destino
  useEffect(() => {
    const map = mapRef.current;
    const g = routeGroupRef.current;
    if (!map || !g) return;
    const pts = (route ?? []) as L.LatLngExpression[];
    routeCasingRef.current?.setLatLngs(pts);
    routeLineRef.current?.setLatLngs(pts);

    if (destination) {
      if (!destMarkerRef.current) {
        destMarkerRef.current = L.marker([destination.lat, destination.lng], {
          icon: DEST_ICON,
          zIndexOffset: 800,
          interactive: false,
          keyboard: false,
        }).addTo(g);
      } else {
        destMarkerRef.current.setLatLng([destination.lat, destination.lng]);
      }
    } else if (destMarkerRef.current) {
      g.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }
  }, [route, destination]);

  // enquadra a rota inteira na pré-visualização (acima do painel inferior)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitRoute || !route || route.length < 2) return;
    followRef.current = false;
    map.fitBounds(L.latLngBounds(route as L.LatLngTuple[]), {
      paddingTopLeft: [30, 90],
      paddingBottomRight: [30, insetRef.current + 30],
      maxZoom: 17,
      animate: true,
    });
  }, [route, fitRoute]);

  // ciclista: marcador com seta, deslizando entre as leituras de GPS
  useEffect(() => {
    const map = mapRef.current;
    const g = userGroupRef.current;
    if (!map || !g) return;

    if (!userPos) {
      const anim = animRef.current;
      if (anim?.raf) cancelAnimationFrame(anim.raf);
      animRef.current = null;
      curPosRef.current = null;
      userMarkerRef.current = null;
      userCircleRef.current = null;
      guideRef.current = null;
      g.clearLayers();
      return;
    }

    const target = L.latLng(userPos.lat, userPos.lng);
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(target, {
        icon: USER_ICON,
        zIndexOffset: 1000,
        interactive: false,
        keyboard: false,
      }).addTo(g);
      userCircleRef.current = L.circle(target, {
        radius: WARN_M,
        color: "#34D399",
        weight: 1.5,
        dashArray: "5 7",
        fillColor: "#10B981",
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(g);
      curPosRef.current = target;
      if (followRef.current) centerOn(target, false, navigatingRef.current ? 17 : 16);
      return;
    }

    const prev = animRef.current;
    if (prev?.raf) cancelAnimationFrame(prev.raf);
    const anim = { from: curPosRef.current ?? target, to: target, t0: performance.now(), raf: null as number | null };
    animRef.current = anim;
    const tick = (now: number) => {
      const t = Math.min(1, (now - anim.t0) / POS_ANIM_MS);
      const ll = L.latLng(
        anim.from.lat + (anim.to.lat - anim.from.lat) * t,
        anim.from.lng + (anim.to.lng - anim.from.lng) * t,
      );
      curPosRef.current = ll;
      userMarkerRef.current?.setLatLng(ll);
      userCircleRef.current?.setLatLng(ll);
      if (followRef.current && !zoomingRef.current) centerOn(ll, false);
      anim.raf = t < 1 ? requestAnimationFrame(tick) : null;
    };
    anim.raf = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- centerOn lê apenas refs
  }, [userPos]);

  // seta gira com o rumo; sem rumo conhecido mostra só o ponto
  useEffect(() => {
    const el = userMarkerRef.current?.getElement()?.querySelector<HTMLElement>(".vdb-nav");
    if (!el) return;
    if (typeof heading === "number" && Number.isFinite(heading)) {
      angleRef.current = nextAngle(angleRef.current, heading);
      el.classList.remove("vdb-nav--still");
      el.style.setProperty("--vdb-rot", `${angleRef.current}deg`);
    } else {
      el.classList.add("vdb-nav--still");
    }
  }, [heading, userPos]);

  // o anel de radar (raio de atenção) fica mais discreto durante a navegação guiada
  useEffect(() => {
    userCircleRef.current?.setStyle({ opacity: navigating ? 0.35 : 0.9, fillOpacity: navigating ? 0.03 : 0.06 });
  }, [navigating, userPos]);

  // seguir o ciclista: ao ligar, voa até ele já com zoom de navegação
  useEffect(() => {
    followRef.current = !!follow;
    const cur = curPosRef.current;
    if (follow && cur) centerOn(cur, true, Math.max(mapRef.current?.getZoom() ?? 0, navigating ? 17 : 16));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à troca de follow/navigating
  }, [follow, navigating]);

  // modo "clique no mapa"
  useEffect(() => {
    pickRef.current.active = !!pickMode;
    pickRef.current.cb = onPick;
    if (mapRef.current) mapRef.current.getContainer().style.cursor = pickMode ? "crosshair" : "";
  }, [pickMode, onPick]);

  useEffect(() => {
    if (!focus || !mapRef.current) return;
    followRef.current = false;
    mapRef.current.flyTo([focus.lat, focus.lng], focus.zoom ?? 16, { duration: 0.8 });
  }, [focus]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full"}
      data-testid="fortaleza-map"
      aria-label="Mapa cicloviário de Fortaleza"
    />
  );
}
