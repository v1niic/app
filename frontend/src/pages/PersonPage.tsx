import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

import BadgeCard from "@/components/gamification/BadgeCard";
import Avatar from "@/components/profile/Avatar";
import FollowButton from "@/components/social/FollowButton";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiGet } from "@/lib/api";
import { BIKE_LABELS, formatKm } from "@/lib/types";
import type { BadgeDef, PublicUser } from "@/lib/types";

export default function PersonPage() {
  const { id = "" } = useParams();
  const { data: me } = useAuth();
  const { data: person, isLoading, error } = useQuery({
    queryKey: ["people", "one", id],
    queryFn: () => apiGet<PublicUser>(`/social/people/${id}`),
    enabled: !!me,
    retry: false,
  });
  const { data: badges = [] } = useQuery({ queryKey: ["badges"], queryFn: () => apiGet<BadgeDef[]>("/badges") });

  if (!me) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-400">
        Entre na sua conta para ver perfis.{" "}
        <Link to="/login" className="font-semibold text-emerald-400 hover:underline">Entrar</Link>
      </div>
    );
  }

  const notFound = error instanceof ApiError && error.status === 404;
  const mine = me.id === id;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-24 md:pb-10" data-testid="person-page">
      <Link to="/ciclistas" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white">
        <ChevronLeft className="h-4 w-4" /> Ciclistas
      </Link>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-800/60" />
      ) : notFound || !person ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
          Este ciclista não está disponível.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="flex items-center gap-4">
              <Avatar name={person.name} src={person.avatar} className="h-20 w-20" textClassName="text-3xl" />
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-heading text-2xl font-black tracking-tight text-white" data-testid="person-name">{person.name}</h1>
                <p className="text-xs text-slate-400">
                  Nível {person.level} · {person.xp} XP · pedala de {BIKE_LABELS[person.bike_type] ?? person.bike_type}
                </p>
                {person.follows_me && !mine && <p className="mt-1 text-[11px] font-semibold text-emerald-400">Segue você</p>}
              </div>
              {mine ? (
                <Link to="/profile" className="text-xs font-semibold text-emerald-400 hover:underline">Editar perfil</Link>
              ) : (
                <FollowButton person={person} size="default" />
              )}
            </div>
            {person.bio && <p className="mt-4 text-sm leading-relaxed text-slate-300">{person.bio}</p>}
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {[
                ["Seguidores", person.followers_count],
                ["Seguindo", person.following_count],
                ["Km", formatKm(person.total_km).replace(/\s?km$/i, "")],
                ["Alertas", person.reports_count],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg bg-slate-800/50 py-2.5">
                  <p className="font-mono text-lg font-bold text-white">{value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 font-heading text-lg font-bold text-white">Selos</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {badges.map((b) => (
                <BadgeCard key={b.id} badge={b} unlocked={person.badge_ids.includes(b.id)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
