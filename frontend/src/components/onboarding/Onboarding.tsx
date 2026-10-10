import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Bike, ChevronLeft, ChevronRight, FlagTriangleRight, Medal, Navigation, Radar, Smartphone, Volume2, X } from "lucide-react";

import HazardIcon from "@/components/map/HazardIcon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiPost } from "@/lib/api";
import { HAZARD_SHORT } from "@/lib/hazards";
import { DANGER_M, WARN_M, WATCH_M } from "@/lib/proximity";
import type { ObstacleType, User } from "@/lib/types";
import { cn } from "@/lib/utils";

const SWIPE_PX = 50;
const HAZARDS: ObstacleType[] = ["buraco", "obra", "trecho_inacabado", "falta_iluminacao", "outros"];

interface Slide {
  title: string;
  text: string;
  art: ReactNode;
}

const SLIDES = (firstName: string): Slide[] => [
  {
    title: `Bem-vindo, ${firstName}!`,
    text: "O VaiDeBike é o seu copiloto de pedal em Fortaleza: mostra as ciclovias, avisa dos perigos no caminho e transforma cada pedalada em pontos.",
    art: (
      <img
        src="/icon-192.png"
        alt=""
        width={112}
        height={112}
        className="h-28 w-28 rounded-[28px] shadow-[0_12px_40px_rgba(16,185,129,0.35)]"
      />
    ),
  },
  {
    title: "Os perigos aparecem no mapa",
    text: "Cada placa mostra um tipo de problema, no ponto exato onde ele está. Toque numa placa para ver a gravidade, a descrição e quantos ciclistas já confirmaram.",
    art: (
      <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-4">
        {HAZARDS.map((t) => (
          <div key={t} className="flex w-[72px] flex-col items-center gap-1.5">
            <HazardIcon type={t} size={32} />
            <span className="text-[11px] font-medium text-slate-300">{HAZARD_SHORT[t]}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "O radar avisa antes de chegar",
    text: "Ligue o GPS pelo botão Radar no mapa. Conforme você se aproxima de um perigo à frente, o app avisa por som, voz e vibração.",
    art: (
      <div className="w-full max-w-[300px] space-y-2">
        {[
          { m: WATCH_M, label: "Radar", note: "a placa cresce no mapa", cls: "bg-emerald-400" },
          { m: WARN_M, label: "Atenção", note: "aviso e cartão no topo", cls: "bg-amber-400" },
          { m: DANGER_M, label: "Perigo", note: "alarme forte e vibração", cls: "bg-red-500" },
        ].map((r) => (
          <div key={r.m} className="flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-800/60 px-3 py-2">
            <span className={cn("h-3 w-3 shrink-0 rounded-full", r.cls)} />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold text-white">{r.label}</p>
              <p className="truncate text-[11px] text-slate-400">{r.note}</p>
            </div>
            <span className="font-mono text-sm font-bold text-slate-200">{r.m} m</span>
          </div>
        ))}
        <div className="flex justify-center gap-4 pt-1 text-slate-400">
          <Volume2 className="h-4 w-4" />
          <Radar className="h-4 w-4" />
          <Smartphone className="h-4 w-4" />
        </div>
      </div>
    ),
  },
  {
    title: "Toque no mapa para decidir",
    text: "Toque num ponto do mapa: um pino aparece com duas opções. Você pode traçar a rota de bike até lá ou reportar um perigo naquele local. Também dá para buscar um endereço no painel de baixo.",
    art: (
      <div className="w-full max-w-[280px] rounded-2xl border border-slate-700/80 bg-slate-900 p-3 text-left shadow-xl" aria-hidden="true">
        <p className="font-heading text-sm font-bold text-white">Ponto no mapa</p>
        <p className="text-xs text-slate-400">O que você quer fazer aqui?</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <span className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-2 py-2 text-xs font-semibold text-[#022C22]">
            <Navigation className="h-3.5 w-3.5" /> Ir até aqui
          </span>
          <span className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-2 py-2 text-xs font-semibold text-slate-200">
            <FlagTriangleRight className="h-3.5 w-3.5" /> Reportar aqui
          </span>
        </div>
      </div>
    ),
  },
  {
    title: "Pedale, reporte e ganhe selos",
    text: "Seus quilômetros e alertas viram XP, sobem seu nível e destravam selos e missões. No perfil você coloca sua foto e acompanha o histórico de pedais.",
    art: (
      <div className="w-full max-w-[300px] space-y-2">
        {[
          { icon: Bike, label: "Cada km pedalado", xp: "+10 XP" },
          { icon: FlagTriangleRight, label: "Perigo reportado e aprovado", xp: "+50 XP" },
          { icon: Medal, label: "Confirmar um alerta", xp: "+25 XP" },
        ].map((r) => (
          <div key={r.label} className="flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-800/60 px-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <r.icon className="h-4 w-4" />
            </span>
            <span className="flex-1 text-left text-sm text-slate-200">{r.label}</span>
            <span className="font-mono text-sm font-bold text-emerald-300">{r.xp}</span>
          </div>
        ))}
      </div>
    ),
  },
];

/**
 * Boas-vindas + tutorial em tela cheia para quem acabou de criar a conta (e para quem toca em "Ver tutorial" no perfil).
 * Fica por cima do app; a marca "já viu" é guardada na conta (`onboarded`), então vale em qualquer aparelho.
 */
export default function Onboarding() {
  const { data: user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const dragRef = useRef<number | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const finish = useMutation({
    mutationFn: () => apiPost<User>("/auth/onboarding", { done: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const visible = !!user && !user.onboarded && pathname !== "/login" && pathname !== "/register";
  const slides = SLIDES((user?.name ?? "ciclista").trim().split(/\s+/)[0] || "ciclista");
  const last = step === slides.length - 1;

  // ao reabrir pelo perfil, começa do primeiro passo
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const close = useCallback(
    (goToMap: boolean) => {
      finish.mutate();
      if (goToMap) navigate("/map");
    },
    [finish, navigate],
  );

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      else if (e.key === "ArrowRight") setStep((s) => Math.min(slides.length - 1, s + 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    primaryRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close, slides.length]);

  if (!visible) return null;

  const slide = slides[step];
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = e.clientX;
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current === null) return;
    const dx = e.clientX - dragRef.current;
    dragRef.current = null;
    if (dx < -SWIPE_PX) setStep((s) => Math.min(slides.length - 1, s + 1));
    else if (dx > SWIPE_PX) setStep((s) => Math.max(0, s - 1));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[3000] flex flex-col bg-[#070B14] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      data-testid="onboarding"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-semibold text-slate-400">
          {step + 1} de {slides.length}
        </span>
        <button
          type="button"
          onClick={() => close(false)}
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-white/10 hover:text-white"
          data-testid="onboarding-skip"
        >
          Pular <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className="flex flex-1 touch-pan-y flex-col items-center justify-center gap-8 overflow-y-auto px-6 text-center"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragRef.current = null)}
      >
        <div key={step} className="vdb-slide flex w-full max-w-md flex-col items-center gap-8">
          <div className="flex min-h-[190px] w-full items-center justify-center">{slide.art}</div>
          <div className="space-y-3">
            <h2 id="onboarding-title" className="font-heading text-2xl font-black tracking-tight text-white sm:text-3xl">
              {slide.title}
            </h2>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-300">{slide.text}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 pb-6 pt-2">
        <div className="flex justify-center gap-2" role="tablist" aria-label="Passos do tutorial">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={`Passo ${i + 1}`}
              onClick={() => setStep(i)}
              className={cn("h-2 rounded-full transition-all", i === step ? "w-6 bg-emerald-400" : "w-2 bg-slate-600 hover:bg-slate-500")}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" size="lg" onClick={() => setStep((s) => s - 1)} aria-label="Passo anterior" data-testid="onboarding-back">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <Button
            ref={primaryRef}
            size="lg"
            className="h-11 flex-1"
            onClick={() => (last ? close(true) : setStep((s) => s + 1))}
            disabled={finish.isPending}
            data-testid="onboarding-next"
          >
            {last ? (
              <>
                <Bike className="h-4 w-4" /> Começar a pedalar
              </>
            ) : (
              <>
                Continuar <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
