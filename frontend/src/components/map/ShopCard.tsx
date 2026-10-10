import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Clock, MapPin, Navigation, Phone, Star, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { apiDelete, apiDetail, apiGet, apiPut } from "@/lib/api";
import { SHOP_META, shopSvg, telHref } from "@/lib/shops";
import type { Shop, ShopDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

function Stars({ value, size = 16, onPick }: { value: number; size?: number; onPick?: (n: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5" role={onPick ? "radiogroup" : "img"} aria-label={`${value.toFixed(1)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value >= n - 0.25;
        const half = !on && value >= n - 0.75;
        const star = (
          <Star
            style={{ width: size, height: size }}
            className={cn(on ? "fill-amber-400 text-amber-400" : half ? "fill-amber-400/50 text-amber-400" : "text-slate-600")}
          />
        );
        return onPick ? (
          <button key={n} type="button" onClick={() => onPick(n)} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} className="p-0.5" data-testid={`star-${n}`}>
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}

interface Props {
  shop: Shop;
  onClose: () => void;
  onRouteTo: (shop: Shop) => void;
}

/** Bolha com os dados do local (telefone, horário, endereço), a nota média e as avaliações dos ciclistas. */
export default function ShopCard({ shop, onClose, onRouteTo }: Props) {
  const { data: user } = useAuth();
  const queryClient = useQueryClient();
  const meta = SHOP_META[shop.kind];

  const { data: detail } = useQuery({
    queryKey: ["shop", shop.id],
    queryFn: () => apiGet<ShopDetail>(`/shops/${shop.id}`),
    enabled: !!user,
  });
  const s = detail ?? shop;

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const mine = detail?.my_review ?? null;
  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setComment(mine?.comment ?? "");
  }, [mine?.rating, mine?.comment, shop.id]);

  const refresh = (d: ShopDetail) => {
    queryClient.setQueryData(["shop", shop.id], d);
    void queryClient.invalidateQueries({ queryKey: ["shops"] }); // nota média nova no mapa
  };
  const save = useMutation({
    mutationFn: () => apiPut<ShopDetail>(`/shops/${shop.id}/review`, { rating, comment }),
    onSuccess: (d) => {
      refresh(d);
      toast.success("Avaliação enviada. Obrigado por ajudar outros ciclistas!");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível enviar a avaliação")),
  });
  const remove = useMutation({
    mutationFn: () => apiDelete<ShopDetail>(`/shops/${shop.id}/review`),
    onSuccess: (d) => {
      refresh(d);
      setRating(0);
      setComment("");
      toast.success("Avaliação removida");
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteShop = useMutation({
    mutationFn: () => apiDelete(`/shops/${shop.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shops"] });
      toast.success("Local removido do mapa");
      onClose();
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível remover o local")),
  });

  const others = (detail?.reviews ?? []).filter((r) => r.user_id !== user?.id);

  return (
    <div
      className="absolute left-3 right-3 z-[1170] flex max-h-[min(70svh,560px)] flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur-xl bottom-[calc(var(--inset)+12px)] md:bottom-6 md:left-[404px] md:right-auto md:w-[380px]"
      data-testid="shop-card"
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white"
          style={{ background: meta.color }}
          dangerouslySetInnerHTML={{ __html: shopSvg(s.kind, 22) }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</p>
          <h3 className="truncate font-heading text-base font-bold text-white" data-testid="shop-name">{s.name}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
            <Stars value={s.rating_avg} size={14} />
            <span data-testid="shop-rating">
              {s.rating_count > 0 ? `${s.rating_avg.toFixed(1)} (${s.rating_count})` : "sem avaliações"}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Fechar" data-testid="shop-close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-4">
        <ul className="space-y-1.5 text-sm text-slate-300">
          {s.address && (
            <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> {s.address}</li>
          )}
          {s.hours && (
            <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> {s.hours}</li>
          )}
          {s.phone ? (
            <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> <a href={telHref(s.phone)} className="font-semibold text-emerald-300 hover:underline" data-testid="shop-phone">{s.phone}</a></li>
          ) : (
            <li className="flex gap-2 text-slate-500"><Phone className="mt-0.5 h-4 w-4 shrink-0" /> Telefone não informado</li>
          )}
          {s.description && <li className="text-xs leading-relaxed text-slate-400">{s.description}</li>}
        </ul>

        <div className="grid grid-cols-2 gap-2">
          {s.phone ? (
            <a
              href={telHref(s.phone)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 text-sm font-semibold text-[#022C22] hover:bg-emerald-400"
              data-testid="shop-call"
            >
              <Phone className="h-4 w-4" /> Ligar
            </a>
          ) : (
            <Button disabled variant="outline"><Phone className="h-4 w-4" /> Ligar</Button>
          )}
          <Button variant="outline" onClick={() => onRouteTo(s)} data-testid="shop-route">
            <Navigation className="h-4 w-4" /> Rota até aqui
          </Button>
        </div>

        {/* avaliar */}
        <div className="rounded-2xl border border-slate-700/70 bg-slate-800/40 p-3">
          {!user ? (
            <p className="text-xs text-slate-400">
              <Link to="/login" className="font-semibold text-emerald-400 hover:underline">Entre</Link> para avaliar este local e ver os comentários.
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold text-white">{mine ? "Sua avaliação" : "Avalie este local"}</p>
              <div className="mt-1"><Stars value={rating} size={26} onPick={setRating} /></div>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Como foi o atendimento? (opcional)"
                className="mt-2 text-sm"
                data-testid="shop-comment"
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={rating < 1 || save.isPending} onClick={() => save.mutate()} data-testid="shop-review-save">
                  {save.isPending ? "Enviando…" : mine ? "Atualizar" : "Enviar avaliação"}
                </Button>
                {mine && (
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>Remover</Button>
                )}
              </div>
            </>
          )}
        </div>

        {others.length > 0 && (
          <ul className="space-y-2" data-testid="shop-reviews">
            {others.map((r) => (
              <li key={r.user_id} className="rounded-xl bg-slate-800/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/ciclistas/${r.user_id}`} className="truncate text-xs font-semibold text-slate-200 hover:text-emerald-300">{r.user_name}</Link>
                  <Stars value={r.rating} size={12} />
                </div>
                {r.comment && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}

        {detail?.can_delete && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-2.5">
            {!confirmDelete ? (
              <Button variant="ghost" size="sm" className="text-red-300 hover:text-red-200" onClick={() => setConfirmDelete(true)} data-testid="shop-delete">
                <Trash2 className="h-4 w-4" /> Remover este local do mapa
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-red-200">Remover de vez, com as avaliações?</span>
                <Button variant="destructive" size="sm" disabled={deleteShop.isPending} onClick={() => deleteShop.mutate()} data-testid="shop-delete-confirm">
                  {deleteShop.isPending ? "Removendo…" : "Sim, remover"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-slate-600">
          {s.source === "osm" ? "Dados do local: © colaboradores do OpenStreetMap." : `Sugerido por ${s.added_by_name || "um ciclista"}.`}
        </p>
      </div>
    </div>
  );
}
