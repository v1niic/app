import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { OBSTACLE_TYPES } from "@/lib/types";
import type { BikeLane, Obstacle } from "@/lib/types";

export interface FocusRequest {
  lat: number;
  lng: number;
  zoom?: number;
}

interface FortalezaMapProps {
  bikeLanes: BikeLane[];
  obstacles: Obstacle[];
  userPos?: { lat: number; lng: number } | null;
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  onSelectObstacle?: (o: Obstacle) => void;
  focus?: FocusRequest | null;
  className?: string;
}

const FORTALEZA_CENTER: L.LatLngExpression = [-3.7319, -38.5267];

/** Mapa escuro de Fortaleza: camadas de ciclovias/ciclofaixas + marcadores pulsantes de obstáculos + beacon de GPS. */
export default function FortalezaMap({
  bikeLanes,
  obstacles,
  userPos,
  pickMode,
  onPick,
  onSelectObstacle,
  focus,
  className,
}: FortalezaMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lanesRef = useRef<L.LayerGroup | null>(null);
  const obstaclesRef = useRef<L.LayerGroup | null>(null);
  const userRef = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef<{ active: boolean; cb?: (lat: number, lng: number) => void }>({
    active: false,
  });
  const fittedRef = useRef(false);

  // inicializa uma única vez (StrictMode remonta — o cleanup remove o mapa)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, { center: FORTALEZA_CENTER, zoom: 12, zoomControl: false });
    // Tiles do OpenStreetMap, escurecidos por CSS (.leaflet-tile-pane) para o tema tático — sem API key.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    lanesRef.current = L.layerGroup().addTo(map);
    obstaclesRef.current = L.layerGroup().addTo(map);
    userRef.current = L.layerGroup().addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (pickRef.current.active && pickRef.current.cb) pickRef.current.cb(e.latlng.lat, e.latlng.lng);
    });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    mapRef.current = map;

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ciclovias / ciclofaixas
  useEffect(() => {
    const g = lanesRef.current;
    if (!g) return;
    g.clearLayers();
    for (const lane of bikeLanes) {
      const color = lane.kind === "ciclovia" ? "#10B981" : "#38BDF8";
      L.polyline(lane.coordinates as L.LatLngExpression[], {
        color,
        weight: 5,
        opacity: 0.75,
        dashArray: lane.kind === "ciclofaixa" ? "8 8" : undefined,
      })
        .bindTooltip(
          `<strong>${lane.name}</strong><br/>${lane.kind === "ciclovia" ? "Ciclovia" : "Ciclofaixa"} · ${lane.length_km} km`,
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

  // marcadores de obstáculos
  useEffect(() => {
    const g = obstaclesRef.current;
    if (!g) return;
    g.clearLayers();
    for (const o of obstacles) {
      const color = OBSTACLE_TYPES[o.type].color;
      const icon = L.divIcon({
        className: "vdb-marker-wrap",
        html: `<span class="vdb-marker${o.severity === "alta" ? " vdb-marker-high" : ""}" style="--vdb-c:${color}" data-testid="obstacle-marker" data-obstacle-type="${o.type}" data-obstacle-id="${o.id}"><span class="vdb-marker-dot"></span><span class="vdb-marker-pulse"></span></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker([o.lat, o.lng], { icon })
        .on("click", () => onSelectObstacle?.(o))
        .addTo(g);
    }
  }, [obstacles, onSelectObstacle]);

  // beacon do ciclista
  useEffect(() => {
    const g = userRef.current;
    if (!g) return;
    g.clearLayers();
    if (!userPos) return;
    const icon = L.divIcon({
      className: "vdb-user-wrap",
      html: `<span class="vdb-user" data-testid="gps-user-beacon"><span class="vdb-user-dot"></span><span class="vdb-user-pulse"></span></span>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    L.marker([userPos.lat, userPos.lng], { icon, zIndexOffset: 500 }).addTo(g);
    L.circle([userPos.lat, userPos.lng], {
      radius: 150,
      color: "#10B981",
      weight: 1,
      fillColor: "#10B981",
      fillOpacity: 0.08,
    }).addTo(g);
  }, [userPos]);

  // modo "clique no mapa"
  useEffect(() => {
    pickRef.current.active = !!pickMode;
    pickRef.current.cb = onPick;
    if (mapRef.current) mapRef.current.getContainer().style.cursor = pickMode ? "crosshair" : "";
  }, [pickMode, onPick]);

  useEffect(() => {
    if (!focus || !mapRef.current) return;
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
