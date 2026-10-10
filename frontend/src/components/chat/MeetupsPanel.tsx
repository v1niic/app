import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarPlus, MapPin, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiDetail, apiGet, apiPost } from "@/lib/api";
import type { BikeLane, Meetup, User } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Valor para <input type="datetime-local"> (horário local do aparelho), daqui a `hours` horas. */
function localInputValue(hours: number): string {
  const d = new Date(Date.now() + hours * 3600_000);
  d.setMinutes(0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** Pedaladas marcadas: qualquer ciclista cria um encontro e os outros confirmam presença. */
export default function MeetupsPanel({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [when, setWhen] = useState(() => localInputValue(24));
  const [description, setDescription] = useState("");

  const { data: meetups = [], isLoading } = useQuery({
    queryKey: ["meetups"],
    queryFn: () => apiGet<Meetup[]>("/meetups"),
    refetchInterval: 15000,
  });
  const { data: lanes = [] } = useQuery({
    queryKey: ["bikelanes"],
    queryFn: () => apiGet<BikeLane[]>("/bikelanes"),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["meetups"] });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<Meetup>("/meetups", {
        title,
        place,
        description,
        starts_at: new Date(when).toISOString(), // o campo é horário local; o servidor guarda em UTC
      }),
    onSuccess: () => {
      toast.success("Encontro marcado! Quem passar por aqui já pode confirmar presença.");
      setOpen(false);
      setTitle("");
      setPlace("");
      setDescription("");
      refresh();
    },
    onError: (err) => toast.error(apiDetail(err, "Confira os campos: título, local e um horário futuro")),
  });

  const joinMutation = useMutation({
    mutationFn: (id: string) => apiPost<Meetup>(`/meetups/${id}/join`),
    onSuccess: refresh,
    onError: (err) => toast.error(apiDetail(err, "Não foi possível atualizar sua presença")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/meetups/${id}`),
    onSuccess: () => {
      toast.success("Encontro cancelado");
      refresh();
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível cancelar")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!when || Number.isNaN(new Date(when).getTime())) {
      toast.error("Escolha a data e a hora");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-4 py-3" data-testid="meetups-panel">
      {!open ? (
        <Button onClick={() => setOpen(true)} className="w-full sm:w-auto" data-testid="meetup-new">
          <CalendarPlus className="h-4 w-4" /> Marcar um encontro
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4" data-testid="meetup-form">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-base font-bold text-white">Novo encontro</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-title" className="text-xs text-slate-400">Nome do encontro</Label>
            <Input id="mt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Pedal de domingo na Beira-Mar" required data-testid="meetup-title" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-place" className="text-xs text-slate-400">Ponto de encontro</Label>
            <Input id="mt-place" list="mt-places" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} placeholder="Escolha uma ciclovia ou escreva o local" required data-testid="meetup-place" />
            <datalist id="mt-places">
              {lanes.map((l) => (
                <option key={l.id} value={l.name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-when" className="text-xs text-slate-400">Dia e hora</Label>
            <Input id="mt-when" type="datetime-local" value={when} min={localInputValue(0)} onChange={(e) => setWhen(e.target.value)} required data-testid="meetup-when" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-desc" className="text-xs text-slate-400">Detalhes (opcional)</Label>
            <Textarea id="mt-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} placeholder="Ritmo, distância, o que levar…" data-testid="meetup-description" />
          </div>
          <p className="text-[11px] leading-snug text-slate-500">
            Marque em lugares públicos e movimentados. Todos os ciclistas logados veem este encontro.
          </p>
          <Button type="submit" disabled={createMutation.isPending} data-testid="meetup-submit">
            {createMutation.isPending ? "Marcando…" : "Marcar encontro"}
          </Button>
        </form>
      )}

      {isLoading ? (
        <div className="h-28 animate-pulse rounded-xl bg-slate-800/60" />
      ) : meetups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400" data-testid="meetups-empty">
          Nenhum encontro marcado. Que tal chamar a galera para pedalar?
        </p>
      ) : (
        <ul className="space-y-3">
          {meetups.map((m) => {
            const date = new Date(m.starts_at);
            const mine = m.user_id === user.id;
            return (
              <li key={m.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4" data-testid="meetup-item">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-heading text-base font-bold text-white">{m.title}</h3>
                    <p className="mt-0.5 text-xs font-semibold capitalize text-emerald-300">
                      {format(date, "EEE, d 'de' MMM · HH:mm", { locale: ptBR })}
                      <span className="ml-2 font-normal normal-case text-slate-500">
                        {formatDistanceToNow(date, { addSuffix: true, locale: ptBR })}
                      </span>
                    </p>
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-300">
                  <MapPin className="h-4 w-4 shrink-0 text-orange-400" /> {m.place}
                </p>
                {m.description && <p className="mt-1.5 text-sm leading-snug text-slate-400">{m.description}</p>}
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  {m.going_count} {m.going_count === 1 ? "vai" : "vão"}
                  {m.going_names.length > 0 && ` · ${m.going_names.join(", ")}${m.going_count > m.going_names.length ? "…" : ""}`}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">Organizado por {mine ? "você" : m.user_name}</p>
                <div className="mt-3 flex gap-2">
                  {mine ? (
                    <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(m.id)} disabled={deleteMutation.isPending} data-testid="meetup-cancel">
                      Cancelar encontro
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={m.going ? "outline" : "default"}
                      onClick={() => joinMutation.mutate(m.id)}
                      disabled={joinMutation.isPending}
                      className={cn(m.going && "border-emerald-500/50 text-emerald-300")}
                      data-testid="meetup-join"
                    >
                      {m.going ? "Confirmado · não vou mais" : "Eu vou"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
