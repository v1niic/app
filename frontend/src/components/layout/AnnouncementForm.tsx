import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiDetail, apiPost } from "@/lib/api";

/** Só a conta de gestão: manda um aviso do app que aparece no sino de todos os ciclistas. */
export default function AnnouncementForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const send = useMutation({
    mutationFn: () => apiPost("/notifications/announcements", { title: title.trim(), body: body.trim() }),
    onSuccess: () => {
      toast.success("Aviso enviado para todos os ciclistas");
      setTitle("");
      setBody("");
      setOpen(false);
    },
    onError: (e) => toast.error(apiDetail(e, "Não foi possível enviar o aviso")),
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpen(true)} data-testid="announce-open">
        <Megaphone className="h-4 w-4" /> Enviar aviso do app
      </Button>
    );
  }
  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4" data-testid="announce-form">
      <p className="text-sm font-semibold text-white">Aviso para todos os ciclistas</p>
      <Input className="mt-3" placeholder="Título (ex.: Novas ciclovias no mapa!)" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="announce-title" />
      <Input className="mt-2" placeholder="Detalhe (opcional)" maxLength={240} value={body} onChange={(e) => setBody(e.target.value)} data-testid="announce-body" />
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={title.trim().length < 3 || send.isPending} onClick={() => send.mutate()} data-testid="announce-send">
          Enviar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
