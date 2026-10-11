import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Camera, Image as ImageIcon, X } from "lucide-react";
import { Link } from "react-router-dom";

import { ApiError, apiDetail, apiPost } from "@/lib/api";
import CameraCapture from "@/components/map/CameraCapture";
import { fileToPhotoDataUrl } from "@/lib/image";
import { OBSTACLE_ICONS } from "@/lib/icons";
import { OBSTACLE_TYPES, SEVERITY_LABELS } from "@/lib/types";
import type { ObstacleType, ReportResult, Severity } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coords: { lat: number; lng: number } | null;
}

const ALL_TYPES = Object.keys(OBSTACLE_TYPES) as ObstacleType[];
const SEVERITIES: Severity[] = ["baixa", "media", "alta"];
const MAX_PHOTOS = 3;

export default function ReportObstacleModal({ open, onOpenChange, coords }: Props) {
  const { data: user } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState<ObstacleType>("buraco");
  const [severity, setSeverity] = useState<Severity>("media");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null); // galeria
  const nativeCamRef = useRef<HTMLInputElement | null>(null); // plano B: câmera do sistema (capture)
  const [cameraOpen, setCameraOpen] = useState(false);

  const addPhoto = (dataUrl: string) => setPhotos((p) => [...p, dataUrl].slice(0, MAX_PHOTOS));
  const cameraUnavailable = () => {
    setCameraOpen(false);
    toast.info("Não deu para abrir a câmera aqui. Abrindo a câmera do celular…");
    window.setTimeout(() => nativeCamRef.current?.click(), 50);
  };

  const onPickPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photos.length);
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (files.length === 0) return;
    setReading(true);
    try {
      const added: string[] = [];
      for (const f of files) added.push(await fileToPhotoDataUrl(f));
      setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ler a foto");
    } finally {
      setReading(false);
    }
  };

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<ReportResult>("/obstacles", {
        type,
        severity,
        description,
        lat: coords?.lat ?? 0,
        lng: coords?.lng ?? 0,
        photos,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["obstacles"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      if (res.obstacle.status === "pendente") {
        toast.success("Alerta enviado para análise", {
          description: "Assim que a equipe aprovar, ele aparece no mapa para todos e você ganha +50 XP.",
        });
      } else {
        toast.success("Alerta publicado! +50 XP", { description: "Ciclistas por perto já veem o aviso no mapa." });
      }
      for (const b of res.new_badges) {
        toast.success(`Novo selo desbloqueado: ${b.name}`, { description: b.desc });
        confetti({ particleCount: 130, spread: 75, origin: { y: 0.7 }, colors: ["#10B981", "#F97316", "#FBBF24"] });
      }
      setDescription("");
      setPhotos([]);
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) toast.error("Faça login para reportar obstáculos");
      else toast.error(apiDetail(err, "Não foi possível enviar o alerta. Tente novamente."));
    },
  });

  const canSubmit = !!coords && description.trim().length >= 3 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-700 bg-slate-900 sm:max-w-md" data-testid="report-modal">
        <DialogHeader>
          <DialogTitle className="font-heading">Reportar obstáculo</DialogTitle>
          <DialogDescription>
            Marque o ponto exato. A equipe analisa o alerta antes de ele aparecer no mapa para todos.
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="space-y-3 py-2" data-testid="report-login-required">
            <p className="text-sm text-slate-300">
              Você precisa de uma conta para reportar obstáculos — assim conseguimos reconhecer quem
              ajuda a rede a crescer.
            </p>
            <div className="flex gap-2">
              <Link to="/login" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="report-goto-login">
                Entrar
              </Link>
              <Link to="/register" className={buttonVariants({ variant: "default", size: "sm" })} data-testid="report-goto-register">
                Criar conta grátis
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Tipo de obstáculo
              </Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALL_TYPES.map((t) => {
                  const Icon = OBSTACLE_ICONS[t];
                  const active = type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      data-testid={`report-type-${t}`}
                      onClick={() => setType(t)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold transition-colors",
                        active
                          ? "border-emerald-500 bg-emerald-500/10 text-white"
                          : "border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-500",
                      )}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OBSTACLE_TYPES[t].color }} />
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="leading-tight">{OBSTACLE_TYPES[t].label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gravidade</Label>
              <div className="grid grid-cols-3 gap-2">
                {SEVERITIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-testid={`report-severity-${s}`}
                    onClick={() => setSeverity(s)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                      severity === s
                        ? "border-orange-500 bg-orange-500/10 text-white"
                        : "border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-500",
                    )}
                  >
                    {SEVERITY_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-description" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Descrição
              </Label>
              <Textarea
                id="report-description"
                data-testid="report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Buraco grande na metade da ciclovia, difícil de desviar."
                rows={3}
                maxLength={280}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Foto do defeito <span className="font-normal normal-case text-slate-500">(opcional, ajuda a aprovar)</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <span key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-700" data-testid="report-photo">
                    <img src={p} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}
                      aria-label={`Remover foto ${i + 1}`}
                      className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCameraOpen(true)}
                      disabled={reading}
                      className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-emerald-500/60 bg-emerald-500/5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
                      data-testid="report-photo-camera"
                    >
                      <Camera className="h-5 w-5" />
                      Câmera
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={reading}
                      className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-600 text-[10px] font-semibold text-slate-400 hover:border-slate-400 disabled:opacity-60"
                      data-testid="report-photo-add"
                    >
                      <ImageIcon className="h-5 w-5" />
                      {reading ? "…" : "Galeria"}
                    </button>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickPhotos} data-testid="report-photo-input" />
                <input ref={nativeCamRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhotos} data-testid="report-photo-native-camera" />
                <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={addPhoto} onUnavailable={cameraUnavailable} />
              </div>
              <p className="text-[10px] text-slate-500">Até {MAX_PHOTOS} fotos. A localização escondida na foto é removida.</p>
            </div>

            {coords && (
              <p className="font-mono text-[11px] text-slate-400" data-testid="report-coords">
                Local: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            )}

            <Button
              className="w-full bg-orange-500 text-[#431407] hover:bg-orange-400"
              disabled={!canSubmit}
              onClick={() => mutation.mutate()}
              data-testid="report-submit"
            >
              {mutation.isPending ? "Enviando…" : "Enviar alerta · +50 XP"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
