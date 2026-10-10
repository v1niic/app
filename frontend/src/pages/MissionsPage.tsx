import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";

import BadgeCard from "@/components/gamification/BadgeCard";
import MissionsTracker from "@/components/gamification/MissionsTracker";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/api";
import type { BadgeDef, LeaderboardEntry, MissionProgress } from "@/lib/types";
import { cn } from "@/lib/utils";

export const LEVEL_STEP = 500;

export default function MissionsPage() {
  const { data: user } = useAuth();
  const { data: missions = [] } = useQuery({
    queryKey: ["missions"],
    queryFn: () => apiGet<MissionProgress[]>("/missions"),
    refetchInterval: 10000,
  });
  const { data: badges = [] } = useQuery({
    queryKey: ["badges"],
    queryFn: () => apiGet<BadgeDef[]>("/badges"),
  });
  const { data: leaderboard = [] } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => apiGet<LeaderboardEntry[]>("/leaderboard"),
    refetchInterval: 15000,
  });

  const xpInLevel = user ? user.xp % LEVEL_STEP : 0;
  const xpPct = (xpInLevel / LEVEL_STEP) * 100;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 pb-24 md:pb-10">
      <h1 className="font-heading text-3xl font-black tracking-tight text-white md:text-4xl" data-testid="missions-title">
        Missões &amp; Selos
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        Reporte alertas, pedale pelas ciclovias e confirme o que você vê — cada ação vira XP e desbloqueia emblemas.
      </p>

      {/* Nível */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5" data-testid="missions-level-card">
        {user ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 font-mono text-xl font-bold text-emerald-400">
                {user.level}
              </span>
              <div>
                <p className="font-heading text-lg font-bold text-white">Nível {user.level}</p>
                <p className="text-xs text-slate-400">
                  {user.xp} XP no total · faltam {LEVEL_STEP - xpInLevel} XP para o nível {user.level + 1}
                </p>
              </div>
            </div>
            <div className="flex-1 md:px-6">
              <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500"
                  style={{ width: `${xpPct}%` }}
                  data-testid="missions-xp-bar"
                />
              </div>
              <p className="mt-1 text-right font-mono text-[11px] text-slate-400">
                {xpInLevel} / {LEVEL_STEP} XP neste nível
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-heading text-lg font-bold text-white">Entre na rede e comece a subir de nível</p>
              <p className="text-xs text-slate-400">
                Cada alerta reportado, km pedalado e confirmação vale XP.
              </p>
            </div>
            <Link to="/register" className={buttonVariants({ size: "sm" })} data-testid="missions-register-cta">
              Criar conta grátis
            </Link>
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="mb-3 font-heading text-xl font-bold text-white">Missões ativas</h2>
          <MissionsTracker missions={missions} />
        </div>
        <div>
          <h2 className="mb-3 font-heading text-xl font-bold text-white">Selos &amp; emblemas</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {badges.map((b) => (
              <BadgeCard key={b.id} badge={b} unlocked={user?.badge_ids.includes(b.id) ?? false} />
            ))}
          </div>
        </div>
      </div>

      {/* Placar */}
      <h2 className="mb-3 mt-10 font-heading text-xl font-bold text-white">Placar da comunidade</h2>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50" data-testid="leaderboard">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Ciclista</TableHead>
              <TableHead className="text-center">Nível</TableHead>
              <TableHead className="text-center">XP</TableHead>
              <TableHead className="text-center">Alertas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaderboard.length > 0 ? (
              leaderboard.map((e) => (
                <TableRow
                  key={e.rank}
                  className={cn(e.name === user?.name && "bg-emerald-500/10")}
                  data-testid={`leaderboard-row-${e.rank}`}
                >
                  <TableCell className="font-mono font-bold text-slate-400">{e.rank}</TableCell>
                  <TableCell className="font-semibold text-white">{e.name}</TableCell>
                  <TableCell className="text-center font-mono">{e.level}</TableCell>
                  <TableCell className="text-center font-mono text-emerald-400">{e.xp}</TableCell>
                  <TableCell className="text-center font-mono">{e.reports_count}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-slate-400">
                  Ninguém pontuou ainda — pedale e seja o primeiro do placar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
        <Zap className="h-3.5 w-3.5 text-emerald-400" /> Dica: o modo GPS no mapa registra seus km automaticamente.
      </p>
    </div>
  );
}