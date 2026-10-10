import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { hazardColor } from "@/lib/hazards";
import type { Obstacle, ObstacleType } from "@/lib/types";

interface Props {
  lat: number;
  lng: number;
  type: ObstacleType;
  /** alertas já aprovados — aparecem como pontos para o gestor enxergar duplicados */
  others?: Obstacle[];
  className?: string;
}

/** Mapa pequeno e fixo (sem arrastar) mostrando onde o alerta foi marcado e o que já existe em volta. */
export default function MiniMap({ lat, lng, type, others = [], className }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, {
      center: [lat, lng],
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // o mapa é criado uma vez por cartão; posição e pontos são atualizados no efeito abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    map.setView([lat, lng], 17, { animate: false });
    for (const o of others) {
      if (Math.abs(o.lat - lat) > 0.003 || Math.abs(o.lng - lng) > 0.003) continue; // só o que cabe na tela
      L.circleMarker([o.lat, o.lng], {
        radius: 6,
        color: "#0B1120",
        weight: 2,
        fillColor: hazardColor(o.type),
        fillOpacity: 0.95,
        interactive: false,
      }).addTo(layer);
    }
    // alerta em análise: anel laranja tracejado + ponto na cor do tipo
    L.circle([lat, lng], { radius: 60, color: "#F97316", weight: 2, dashArray: "4 6", fillOpacity: 0.06, interactive: false }).addTo(layer);
    L.circleMarker([lat, lng], {
      radius: 9,
      color: "#fff",
      weight: 3,
      fillColor: hazardColor(type),
      fillOpacity: 1,
      interactive: false,
    }).addTo(layer);
  }, [lat, lng, type, others]);

  return <div ref={ref} className={className ?? "h-40 w-full"} aria-label="Local do alerta no mapa" />;
}
