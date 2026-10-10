import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Camera, CircleHelp, LogOut, Save } from "lucide-react";

import BadgeCard from "@/components/gamification/BadgeCard";
import Avatar from "@/components/profile/Avatar";
import AccountSecurity from "@/components/profile/AccountSecurity";
import RideHistory from "@/components/profile/RideHistory";
import UserStatsCard from "@/components/profile/UserStatsCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { apiDelete, apiDetail, apiGet, apiPost, apiPut } from "@/lib/api";
import { BIKE_LABELS } from "@/lib/types";
import type { BadgeDef, Obstacle, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fileToAvatarDataUrl } from "@/lib/image";
import { endSession } from "@/lib/session";

export default function ProfilePage() {
  const { data: user, isLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: badges = [] } = useQuery({
    queryKey: ["badges"],
    queryFn: () => apiGet<BadgeDef[]>("/badges"),
  });
  const { data: myReports = [] } = useQuery({
    queryKey: ["obstacles", "mine"],
    queryFn: () => apiGet<Obstacle[]>("/obstacles?mine=1&status=todos"),
    enabled: !!user,
  });

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [bikeType, setBikeType] = useState("urbana");

  const userId = user?.id;
  useEffect(() => {
    if (user) {
      setName(user.name);
      setBio(user.bio ?? "");
      setBikeType(user.bike_type);
    }
  }, [userId]); // preenche o formulário quando a sessão chega

  const saveMutation = useMutation({
    mutationFn: () => apiPut<User>("/auth/me", { name, bio, bike_type: bikeType }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Perfil atualizado!");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível salvar o perfil")),
  });

  const fileRef = useRef<HTMLInputElement | null>(null);
  const avatarMutation = useMutation({
    mutationFn: (avatar: string) => apiPut<User>("/auth/me", { avatar }),
    onSuccess: (_u, avatar) => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(avatar ? "Foto atualizada!" : "Foto removida");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível salvar a foto")),
  });

  const onPickAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    try {
      avatarMutation.mutate(await fileToAvatarDataUrl(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ler a imagem");
    }
  };

  const withdrawMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/obstacles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["obstacles"] });
      toast.success("Alerta retirado");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível retirar o alerta")),
  });

  const tutorialMutation = useMutation({
    mutationFn: () => apiPost<User>("/auth/onboarding", { done: false }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me"] }), // o gate do App reabre o tutorial
  });

  const logout = async () => {
    await endSession();
    navigate("/");
    toast.success("Sessão encerrada. Boa pedalada!");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 pb-24 md:pb-10">
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-800/60" />
      ) : !user ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center" data-testid="profile-login-required">
          <h1 className="font-heading text-2xl font-black text-white">Você não está logado</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Entre para acompanhar seus km, alertas reportados, selos conquistados e seu nível na rede.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link to="/login" className="text-sm font-semibold text-emerald-400 underline-offset-4 hover:underline" data-testid="profile-goto-login">
              Entrar
            </Link>
            <Link to="/register" className="text-sm font-semibold text-emerald-400 underline-offset-4 hover:underline" data-testid="profile-goto-register">
              Criar conta grátis
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Cabeçalho do ciclista */}
          <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5 md:flex-row md:items-center md:justify-between" data-testid="profile-header">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar name={user.name} src={user.avatar} className="h-20 w-20" textClassName="text-3xl" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarMutation.isPending}
                  aria-label="Trocar foto de perfil"
                  data-testid="avatar-change"
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-900 bg-emerald-500 text-[#022C22] shadow-lg hover:bg-emerald-400 disabled:opacity-60"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickAvatar}
                  data-testid="avatar-input"
                />
              </div>
              <div>
                <h1 className="font-heading text-2xl font-black tracking-tight text-white" data-testid="profile-name">{user.name}</h1>
                <p className="text-xs text-slate-400" data-testid="profile-email">{user.email}</p>
                {user.avatar && (
                  <button
                    type="button"
                    onClick={() => avatarMutation.mutate("")}
                    className="mt-0.5 text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                    data-testid="avatar-remove"
                  >
                    remover foto
                  </button>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  Nível {user.level} · {user.xp} XP · pedala de {BIKE_LABELS[user.bike_type] ?? user.bike_type}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => tutorialMutation.mutate()}
                disabled={tutorialMutation.isPending}
                data-testid="profile-tutorial"
              >
                <CircleHelp className="h-4 w-4" /> Ver tutorial
              </Button>
              <Button variant="destructive" size="sm" onClick={logout} data-testid="profile-logout">
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            </div>
          </div>

          <UserStatsCard user={user} />

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            {/* Editar perfil */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5" data-testid="profile-edit-form">
              <h2 className="font-heading text-lg font-bold text-white">Editar perfil</h2>
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-name-input" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Nome
                  </Label>
                  <Input
                    id="profile-name-input"
                    data-testid="profile-name-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-bio-input" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Bio
                  </Label>
                  <Textarea
                    id="profile-bio-input"
                    data-testid="profile-bio-input"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={280}
                    placeholder="Conte como você pedala em Fortaleza…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tipo de bike</Label>
                  <Select value={bikeType} onValueChange={(v: string) => setBikeType(v)}>
                    <SelectTrigger data-testid="profile-bike-type">
                      <SelectValue>{(v: string) => BIKE_LABELS[v] ?? "Urbana"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(BIKE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  data-testid="profile-save"
                  className="w-full sm:w-auto"
                >
                  <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando…" : "Salvar alterações"}
                </Button>
              </div>
            </div>

            {/* Diário de alertas */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5" data-testid="profile-reports">
              <h2 className="font-heading text-lg font-bold text-white">Meus alertas reportados</h2>
              {myReports.length > 0 ? (
                <ul className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {myReports.map((o) => (
                    <li key={o.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2" data-testid="profile-report-item">
                      <p className="text-xs font-semibold text-slate-200">
                        {o.description}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {OBSTACLE_TYPE_LABEL(o.type)}
                        {o.status === "ativo" || o.status === "resolvido" ? ` · ${o.confirms} confirmações` : ""}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            o.status === "pendente" && "bg-amber-400/15 text-amber-200",
                            o.status === "ativo" && "bg-emerald-500/15 text-emerald-300",
                            o.status === "recusado" && "bg-red-500/15 text-red-300",
                            o.status === "resolvido" && "bg-slate-700 text-slate-300",
                          )}
                          data-testid="profile-report-status"
                        >
                          {{ pendente: "Em análise", ativo: "No mapa", recusado: "Recusado", resolvido: "Resolvido" }[o.status] ?? o.status}
                        </span>
                        {(o.status === "pendente" || o.status === "recusado") && (
                          <button
                            type="button"
                            onClick={() => withdrawMutation.mutate(o.id)}
                            disabled={withdrawMutation.isPending}
                            className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                            data-testid="profile-report-withdraw"
                          >
                            Retirar
                          </button>
                        )}
                      </div>
                      {o.status === "recusado" && o.reject_reason && (
                        <p className="mt-1 text-[11px] text-red-300/80">Motivo: {o.reject_reason}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-400">
                  Nenhum alerta ainda — reporte o primeiro e ganhe o selo Olho de Águia.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <RideHistory />
            <AccountSecurity />
          </div>

          {/* Selos */}
          <div>
            <h2 className="mb-3 font-heading text-lg font-bold text-white">Minha sala de selos</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {badges.map((b) => (
                <BadgeCard key={b.id} badge={b} unlocked={user.badge_ids.includes(b.id)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OBSTACLE_TYPE_LABEL(type: string): string {
  const labels: Record<string, string> = {
    buraco: "Buraco",
    obra: "Obra",
    trecho_inacabado: "Trecho inacabado",
    falta_iluminacao: "Iluminação",
    outros: "Outro",
  };
  return labels[type] ?? type;
}