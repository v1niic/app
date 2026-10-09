import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bike } from "lucide-react";

import { apiGet } from "@/lib/api";
import { formatKm } from "@/lib/types";
import type { RideEntry } from "@/lib/types";

/** Últimos pedais registrados (o app grava um a cada vez que o GPS é encerrado). */
export default function RideHistory() {
  const { data: rides = [], isLoading } = useQuery({
    queryKey: ["rides"],
    queryFn: () => apiGet<RideEntry[]>("/rides?limit=20"),
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5" data-testid="profile-rides">
      <h2 className="font-heading text-lg font-bold text-white">Histórico de pedais</h2>
      {isLoading ? (
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-slate-800/60" />
      ) : rides.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          Seus pedais aparecem aqui. Ligue o GPS no mapa e pedale — ao encerrar, os km viram XP.
        </p>
      ) : (
        <ul className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {rides.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
              data-testid="profile-ride-item"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <Bike className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold text-white">{formatKm(r.km)}</p>
                <p className="text-[11px] text-slate-500">
                  {format(new Date(r.created_at), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              <span className="text-xs font-semibold text-emerald-300">+{r.xp} XP</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
