import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPinned, ShieldCheck, Siren, Trophy } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { OBSTACLE_TYPES, SEVERITY_LABELS } from "@/lib/types";
import type { Obstacle, StatsPublic } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const HERO_IMG =
  "https://images.unsplash.com/photo-1523815378073-a43ae3fbf36a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwzfHxjeWNsaXN0JTIwY2l0eSUyMHN0cmVldCUyMGJpa2V8ZW58MHx8fHwxNzkxMjM3MDQxfDA&ixlib=rb-4.1.0&q=85";

const FEATURES = [
  {
    icon: MapPinned,
    title: "Mapa cicloviário de Fortaleza",
    desc: "Veja quais ruas, avenidas e trechos têm ciclovia ou ciclofaixa — Beira-Mar, Aguanambi, Domingos Olímpio, Washington Soares e mais.",
  },
  {
    icon: Siren,
    title: "Alertas em tempo real",
    desc: "Buracos, obras e trechos inacabados reportados pela comunidade. O modo GPS avisa quando você se aproxima de um perigo.",
  },
  {
    icon: Trophy,
    title: "Missões, emblemas e selos",
    desc: "Ganhe XP e desbloqueie emblemas ao reportar alertas, pedalar km e completar missões — do Calouro do Pedal ao Centurião Cearense.",
  },
];

export default function Home() {
  // Radar ao vivo — a página nunca depende dessas chamadas para renderizar (preview estático segue de pé).
  const { data: stats, isError: statsError } = useQuery<StatsPublic>({
    queryKey: ["stats"],
    queryFn: () => apiGet<StatsPublic>("/stats"),
    refetchInterval: 15000,
    retry: false,
  });
  const { data: recent = [], isLoading, isError } = useQuery<Obstacle[]>({
    queryKey: ["obstacles"],
    queryFn: () => apiGet<Obstacle[]>("/obstacles"),
    refetchInterval: 10000,
    retry: false,
  });

  const counters: { label: string; value?: number; testid: string }[] = [
    { label: "Ciclovias e ciclofaixas mapeadas", value: stats?.bikelanes, testid: "home-counter-lanes" },
    { label: "Alertas ativos agora", value: stats?.obstacles_ativos, testid: "home-counter-active" },
    { label: "Alertas reportados", value: stats?.reports_total, testid: "home-counter-total" },
    { label: "Ciclistas na rede", value: stats?.ciclistas, testid: "home-counter-cyclists" },
  ];

  return (
    <div className="pb-16 md:pb-0">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-slate-800">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(9,13,22,0.97) 0%, rgba(9,13,22,0.85) 55%, rgba(9,13,22,0.55) 100%)",
          }}
        />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 py-20 md:flex-row md:items-center md:py-28">
          <div className="max-w-xl">
            <span className="inline-block rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Fortaleza · Ceará
            </span>
            <h1 className="mt-4 font-heading text-4xl font-black leading-tight tracking-tight text-white md:text-5xl">
              Pedale seguro pelas vias de Fortaleza.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-300 md:text-lg">
              O VaiDeBike é seu copiloto de pedal: mapa das ciclovias e ciclofaixas, alertas de buracos,
              obras e trechos inacabados em tempo real — e missões que recompensam quem ajuda a rede a
              crescer.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/map" className={buttonVariants({ size: "lg" })} data-testid="home-cta-map">
                Abrir o mapa
              </Link>
              <Link
                to="/register"
                className={buttonVariants({ variant: "outline", size: "lg" })}
                data-testid="home-cta-register"
              >
                Criar conta grátis
              </Link>
            </div>
          </div>

          {/* RADAR AO VIVO */}
          <div className="w-full max-w-sm shrink-0 justify-self-end rounded-xl border border-slate-700/70 bg-slate-900/85 p-4 shadow-2xl backdrop-blur-md md:ml-auto">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-white" data-testid="home-radar-title">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> Radar ao vivo
              </h2>
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> atualiza a cada 10s
              </span>
            </div>
            <ul className="mt-3 space-y-2" data-testid="home-radar-list">
              {isLoading ? (
                [0, 1, 2, 3].map((i) => (
                  <li key={i} className="h-10 animate-pulse rounded-lg bg-slate-800/70" />
                ))
              ) : recent.length > 0 ? (
                recent.slice(0, 5).map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                    data-testid="home-radar-item"
                  >
                    <span className="flex items-center gap-2 text-xs text-slate-200">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: OBSTACLE_TYPES[o.type].color }}
                      />
                      <span className="font-semibold">{OBSTACLE_TYPES[o.type].label}</span>
                      <span className="text-slate-500">· gravidade {SEVERITY_LABELS[o.severity].toLowerCase()}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-500">
                      {formatDistanceToNow(new Date(o.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </li>
                ))
              ) : (
                <li className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3 text-xs text-slate-400">
                  {isError || statsError
                    ? "Radar indisponível agora — reconecta em instantes."
                    : "Nenhum alerta ativo no momento. Boa pedalada!"}
                </li>
              )}
            </ul>
          </div>
        </div>
      </section>

      {/* CONTADORES */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {counters.map((c) => (
            <div
              key={c.label}
              data-testid={c.testid}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-emerald-500/40"
            >
              <p className="font-mono text-3xl font-bold tracking-tight text-emerald-400">
                {c.value === undefined ? "—" : c.value}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="font-heading text-2xl font-black tracking-tight text-white md:text-3xl">
          Feito por ciclistas, para ciclistas
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-[0_8px_30px_rgba(16,185,129,0.12)]"
              data-testid="home-feature-card"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-heading text-base font-bold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-800 bg-slate-900/40">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-black tracking-tight text-white">
              Pronto para pedalar mais seguro?
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Crie sua conta, ganhe o emblema Calouro do Pedal e comece a mapear a cidade.
            </p>
          </div>
          <Link to="/register" className={buttonVariants({ size: "lg" })} data-testid="home-cta-register-bottom">
            Criar conta grátis
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        VaiDeBike — feito para os ciclistas de Fortaleza-CE. Dados de alertas gerados pela comunidade.
      </footer>
    </div>
  );
}
