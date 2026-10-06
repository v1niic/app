import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { FlagTriangleRight, Layers, LocateFixed, X } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import BottomSheet from "@/components/map/BottomSheet";
import FortalezaMap from "@/components/map/FortalezaMap";
import type { FocusRequest } from "@/components/map/FortalezaMap";
import LiveGPSTracker from "@/components/map/LiveGPSTracker";
import NavigationPanel, { ManeuverBanner } from "@/components/map/NavigationPanel";
import ReportObstacleModal from "@/components/map/ReportObstacleModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigation } from "@/hooks/useNavigation";
import type { NavPhase } from "@/hooks/useNavigation";
import { playAlertBeep, useRide } from "@/hooks/useRide";
import { apiDetail, apiGet, apiPost } from "@/lib/api";
import { OBSTACLE_TYPES, SEVERITY_LABELS, haversine } from "@/lib/types";
import type { BikeLane, Obstacle, ObstacleType, ReportResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL_TYPES = Object.keys(OBSTACLE_TYPES) as ObstacleType[];

/** Alturas (px) de encaixe do painel inferior em cada fase da navegação. */
const SHEET_SNAPS: Record<NavPhase, number[]> = {
  idle: [150, 340, 560],
  preview: [280, 420],
  navigating: [170, 400],
  arrived: [240],
};

const SWIPE_DISMISS_PX = 70;

export default function MapPage() {
  const [searchParams] = useSearchParams();
  const { data: user } = useAuth();
  const queryClient = useQueryClient();

  const { data: lanes = [] } = useQuery({
    queryKey: ["bikelanes"],
    queryFn: () => apiGet<BikeLane[]>("/bikelanes"),
  });
  const { data: obstacles = [] } = useQuery({
    queryKey: ["obstacles"],
    queryFn: () => apiGet<Obstacle[]>("/obstacles"),
    refetchInterval: 10000,
  });

  const [typeFilter, setTypeFilter] = useState<Set<ObstacleType>>(new Set(ALL_TYPES));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [reportCoords, setReportCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Obstacle | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [follow, setFollow] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [inset, setInset] = useState(0); // px do rodapé do mapa até o topo do painel inferior
  const [cardDy, setCardDy] = useState(0); // arrasto do cartão do alerta (deslizar para baixo fecha)
  const autoReportRef = useRef(false);
  const cardDragRef = useRef<number | null>(null);

  const ride = useRide();

  // ?report=1 chega do botão "Reportar" da navbar
  useEffect(() => {
    if (searchParams.get("report") === "1" && !autoReportRef.current) {
      autoReportRef.current = true;
      setPickMode(true);
      toast.info("Toque no mapa para marcar onde está o obstáculo");
    }
  }, [searchParams]);

  const filtered = useMemo(() => obstacles.filter((o) => typeFilter.has(o.type)), [obstacles, typeFilter]);

  const nav = useNavigation(ride, filtered);
  const phase = nav.phase;

  const nearest = useMemo(() => {
    if (!ride.pos) return null;
    let best: { obstacle: Obstacle; distM: number } | null = null;
    for (const o of filtered) {
      const d = haversine(ride.pos, { lat: o.lat, lng: o.lng });
      if (!best || d < best.distM) best = { obstacle: o, distM: d };
    }
    return best;
  }, [ride.pos, filtered]);

  const alertObstacleId = nearest && nearest.distM < 200 ? nearest.obstacle.id : null;
  useEffect(() => {
    if (ride.riding && alertObstacleId) playAlertBeep();
  }, [alertObstacleId, ride.riding]);

  // câmera acompanha o ciclista enquanto pedala/navega; arrastar o mapa solta a câmera (botão "recentralizar" volta)
  useEffect(() => {
    setFollow(ride.riding || phase === "navigating");
  }, [ride.riding, phase]);

  // cada fase começa com o painel no menor encaixe; resultados de busca abrem o painel
  useEffect(() => {
    setSheetIndex(0);
  }, [phase]);
  useEffect(() => {
    if (nav.places.length > 0) setSheetIndex((i) => Math.max(i, 1));
  }, [nav.places]);

  const demoLane = useMemo(() => lanes.find((l) => l.id === "beira-mar") ?? lanes[0] ?? null, [lanes]);
  const handleStartDemo = useCallback(() => {
    if (!demoLane) return;
    ride.startDemo(demoLane);
    toast.info(`Rota demo: ${demoLane.name}`);
  }, [demoLane, ride]);

  const onPick = useCallback((lat: number, lng: number) => {
    setPickMode(false);
    setReportCoords({ lat, lng });
    setModalOpen(true);
  }, []);

  const onSelectObstacle = useCallback((o: Obstacle) => {
    setSelected(o);
    setFollow(false);
    setFocus({ lat: o.lat, lng: o.lng, zoom: 16 });
  }, []);

  const onUserPan = useCallback(() => setFollow(false), []);

  // segurar o dedo no mapa = "ir para cá"
  const { chooseDestination } = nav;
  const onLongPress = useCallback(
    (lat: number, lng: number) => {
      if (phase === "navigating" || phase === "arrived") {
        toast.info("Encerre a navegação atual para escolher outro destino");
        return;
      }
      chooseDestination({ lat, lng, name: "Ponto escolhido no mapa" });
    },
    [phase, chooseDestination],
  );

  const toggleType = (t: ObstacleType) =>
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  // deslizar o cartão do alerta para baixo fecha (gesto)
  const onCardPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    cardDragRef.current = e.clientY;
  };
  const onCardPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (cardDragRef.current === null) return;
    setCardDy(Math.max(0, e.clientY - cardDragRef.current));
  };
  const onCardPointerUp = () => {
    if (cardDragRef.current === null) return;
    cardDragRef.current = null;
    if (cardDy > SWIPE_DISMISS_PX) setSelected(null);
    setCardDy(0);
  };

  const confirmMutation = useMutation({
    mutationFn: (id: string) => apiPost<ReportResult>(`/obstacles/${id}/confirm`),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["obstacles"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setSelected((s) => (s ? { ...s, confirms: res.obstacle.confirms } : s));
      toast.success("Alerta confirmado! +25 XP");
      for (const b of res.new_badges) {
        toast.success(`Novo selo desbloqueado: ${b.name}`, { description: b.desc });
        confetti({ particleCount: 130, spread: 75, origin: { y: 0.7 }, colors: ["#10B981", "#F97316", "#FBBF24"] });
      }
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível confirmar agora")),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiPost<Obstacle>(`/obstacles/${id}/resolve`),
    onSuccess: (o) => {
      void queryClient.invalidateQueries({ queryKey: ["obstacles"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      setSelected((s) => (s ? { ...s, status: o.status } : s));
      toast.success("Alerta marcado como resolvido. Obrigado!");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível resolver o alerta")),
  });

  const proximityAlert = ride.riding && nearest && nearest.distM < 200 ? nearest : null;

  return (
    <div
      className="relative h-[calc(100svh-3.5rem)] w-full overflow-hidden"
      style={{ "--inset": `${inset}px` } as CSSProperties}
      data-testid="map-page"
    >
      <FortalezaMap
        bikeLanes={lanes}
        obstacles={filtered}
        userPos={ride.pos}
        heading={ride.heading}
        navigating={phase === "navigating"}
        follow={follow}
        onUserPan={onUserPan}
        route={nav.remainingCoords}
        routeObstacleIds={nav.routeObstacleIds}
        fitRoute={phase === "preview"}
        destination={nav.destination}
        bottomInset={inset}
        pickMode={pickMode}
        onPick={onPick}
        onLongPress={onLongPress}
        onSelectObstacle={onSelectObstacle}
        focus={focus}
        className="absolute inset-0 h-full w-full"
      />

      {/* Faixa superior: próxima manobra / alerta de obstáculo */}
      {phase === "navigating" && <ManeuverBanner nav={nav} ride={ride} alert={proximityAlert} />}

      {/* Dica do modo "reportar" */}
      {pickMode && (
        <div className="absolute left-1/2 top-3 z-[1180] -translate-x-1/2 rounded-full border border-orange-500/50 bg-slate-900/90 px-4 py-2 text-xs font-medium text-orange-200 shadow-xl backdrop-blur-md">
          Toque no mapa para marcar o obstáculo
          <button type="button" className="ml-3 underline" onClick={() => setPickMode(false)}>
            cancelar
          </button>
        </div>
      )}

      {/* HUD GPS clássico (desktop, sem destino): velocidade, km e alerta de proximidade */}
      {phase === "idle" && (
        <div className="absolute right-3 top-3 z-[1100] hidden md:block">
          <LiveGPSTracker ride={ride} nearest={nearest} onStartDemo={handleStartDemo} />
        </div>
      )}

      {/* Botões flutuantes (acompanham a altura do painel inferior) */}
      <div className="absolute right-3 z-[1160] flex flex-col items-end gap-3 bottom-[calc(var(--inset)+16px)] md:bottom-6">
        {!follow && ride.pos && (
          <Button
            size="icon-lg"
            variant="secondary"
            className="h-11 w-11 rounded-full border border-slate-700 bg-slate-900/90 shadow-xl backdrop-blur-md"
            onClick={() => setFollow(true)}
            aria-label="Recentralizar no meu local"
            data-testid="map-recenter"
          >
            <LocateFixed className="h-5 w-5 text-emerald-400" />
          </Button>
        )}
        <Button
          size="icon-lg"
          variant="secondary"
          className="h-11 w-11 rounded-full border border-slate-700 bg-slate-900/90 shadow-xl backdrop-blur-md"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-label="Camadas de alerta"
          aria-expanded={filtersOpen}
          data-testid="map-filters-toggle"
        >
          <Layers className="h-5 w-5" />
        </Button>
        <Button
          size="lg"
          className="h-12 rounded-full bg-orange-500 px-4 text-[#431407] shadow-[0_8px_30px_rgba(249,115,22,0.35)] hover:bg-orange-400"
          onClick={() => setPickMode((p) => !p)}
          aria-label="Reportar obstáculo"
          data-testid="map-report-button"
        >
          <FlagTriangleRight className="h-5 w-5" />
          <span className="hidden md:inline">{pickMode ? "Cancelar" : "Reportar obstáculo"}</span>
        </Button>
      </div>

      {/* Filtros de camada */}
      {filtersOpen && (
        <div
          className="absolute right-16 z-[1160] w-[230px] max-w-[calc(100vw-5rem)] rounded-xl border border-slate-700/60 bg-slate-900/90 p-3 shadow-2xl backdrop-blur-md bottom-[calc(var(--inset)+16px)] md:bottom-6"
          data-testid="map-filters"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Camadas de alerta</p>
          <div className="mt-2 space-y-1">
            {ALL_TYPES.map((t) => {
              const on = typeFilter.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  data-testid={`filter-${t}`}
                  onClick={() => toggleType(t)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
                    on ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-800/50",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border"
                    style={{ background: on ? OBSTACLE_TYPES[t].color : "transparent", borderColor: OBSTACLE_TYPES[t].color }}
                  />
                  {OBSTACLE_TYPES[t].label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 border-t border-slate-800 pt-2 text-[10px] leading-relaxed text-slate-500">
            <span className="mr-1 inline-block h-0.5 w-5 bg-emerald-500 align-middle" /> ciclovia
            <span className="mx-1 ml-2 inline-block h-0.5 w-5 border-b-2 border-dashed border-sky-400 align-middle" /> ciclofaixa
          </div>
        </div>
      )}

      {/* Painel inferior arrastável: busca → prévia da rota → guiando → chegada */}
      <BottomSheet
        snaps={SHEET_SNAPS[phase]}
        index={sheetIndex}
        onIndexChange={setSheetIndex}
        onInsetChange={setInset}
        testId="nav-sheet"
      >
        <NavigationPanel nav={nav} ride={ride} lanes={lanes} sheetIndex={sheetIndex} />
      </BottomSheet>

      {/* Painel do alerta selecionado (deslize para baixo para fechar) */}
      {selected && (
        <Card
          className="absolute left-3 right-3 z-[1170] border-slate-700/80 bg-slate-900/95 backdrop-blur-md bottom-[calc(var(--inset)+12px)] md:bottom-6 md:left-[404px] md:right-auto md:w-[340px]"
          style={{ transform: cardDy ? `translateY(${cardDy}px)` : undefined, opacity: cardDy ? 1 - cardDy / 220 : 1 }}
          data-testid="obstacle-details"
        >
          <div
            className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center md:hidden"
            onPointerDown={onCardPointerDown}
            onPointerMove={onCardPointerMove}
            onPointerUp={onCardPointerUp}
            onPointerCancel={onCardPointerUp}
            aria-hidden="true"
          >
            <span className="h-1 w-9 rounded-full bg-slate-600" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-heading text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: OBSTACLE_TYPES[selected.type].color }} />
              {OBSTACLE_TYPES[selected.type].label}
              {selected.status === "resolvido" && <Badge variant="secondary">resolvido</Badge>}
            </CardTitle>
            <CardDescription className="text-xs">
              Gravidade: {SEVERITY_LABELS[selected.severity]} · reportado por {selected.user_name}
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon-xs" onClick={() => setSelected(null)} data-testid="obstacle-details-close">
                <X className="h-4 w-4" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="text-xs text-slate-300">
            <p className="leading-relaxed">{selected.description}</p>
            <p className="mt-2 text-slate-500">
              {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true, locale: ptBR })} ·{" "}
              <span data-testid="obstacle-confirms">{selected.confirms} confirmações</span>
            </p>
            {selected.status !== "resolvido" && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate(selected.id)}
                  data-testid="obstacle-confirm-button"
                >
                  Confirmar alerta
                </Button>
                {user?.id === selected.user_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate(selected.id)}
                    data-testid="obstacle-resolve-button"
                  >
                    Marcar resolvido
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ReportObstacleModal open={modalOpen} onOpenChange={setModalOpen} coords={reportCoords} />
    </div>
  );
}
