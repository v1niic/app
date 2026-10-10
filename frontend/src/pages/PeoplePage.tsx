import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Users } from "lucide-react";

import PersonCard from "@/components/social/PersonCard";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/api";
import type { PublicUser } from "@/lib/types";

type Tab = "descobrir" | "seguindo" | "seguidores";

export default function PeoplePage() {
  const { data: user, isLoading: loadingUser } = useAuth();
  const [tab, setTab] = useState<Tab>("descobrir");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");

  // espera o usuário parar de digitar antes de buscar
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const path =
    tab === "descobrir"
      ? `/social/people?q=${encodeURIComponent(q)}`
      : `/social/people/${user?.id}/${tab === "seguindo" ? "following" : "followers"}`;
  const { data: people = [], isLoading } = useQuery({
    queryKey: ["people", tab, tab === "descobrir" ? q : user?.id],
    queryFn: () => apiGet<PublicUser[]>(path),
    enabled: !!user,
  });

  if (!loadingUser && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-400">
        Entre na sua conta para encontrar e seguir outros ciclistas.{" "}
        <Link to="/login" className="font-semibold text-emerald-400 hover:underline">Entrar</Link>
      </div>
    );
  }

  const empty = {
    descobrir: q ? `Ninguém encontrado para “${q}”.` : "Ainda não há outros ciclistas por aqui. Convide amigos!",
    seguindo: "Você ainda não segue ninguém. Use a aba Descobrir.",
    seguidores: "Ninguém segue você ainda. Reporte alertas e participe do chat para ser notado!",
  }[tab];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-24 md:pb-10" data-testid="people-page">
      <h1 className="font-heading text-2xl font-black tracking-tight text-white">Ciclistas</h1>
      <p className="mt-1 text-sm text-slate-400">Encontre quem pedala em Fortaleza e siga para acompanhar.</p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-5">
        <TabsList className="w-full">
          <TabsTrigger value="descobrir" data-testid="people-tab-descobrir">Descobrir</TabsTrigger>
          <TabsTrigger value="seguindo" data-testid="people-tab-seguindo">Seguindo</TabsTrigger>
          <TabsTrigger value="seguidores" data-testid="people-tab-seguidores">Seguidores</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "descobrir" && (
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar por nome…" className="pl-9" data-testid="people-search" />
        </div>
      )}

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <div className="h-20 animate-pulse rounded-xl bg-slate-800/60" />
        ) : people.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center" data-testid="people-empty">
            <Users className="mx-auto h-8 w-8 text-slate-500" />
            <p className="mt-3 text-sm text-slate-400">{empty}</p>
          </div>
        ) : (
          people.map((p) => <PersonCard key={p.id} person={p} />)
        )}
      </div>
    </div>
  );
}
