import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { mediaUrl } from "@/lib/api";

/** Miniaturas das fotos de comprovação; tocar abre a foto grande. */
export default function PhotoStrip({ ids, className }: { ids?: string[]; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!ids || ids.length === 0) return null;
  return (
    <>
      <div className={className ?? "mt-2 flex gap-2"} data-testid="photo-strip">
        {ids.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => setOpen(id)}
            aria-label={`Ver foto ${i + 1} de ${ids.length}`}
            className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-800"
          >
            <img src={mediaUrl(`/obstacles/photos/${id}`)} alt={`Foto ${i + 1} do alerta`} loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="border-slate-700 bg-slate-950 p-2 sm:max-w-2xl" data-testid="photo-viewer">
          <DialogTitle className="sr-only">Foto do alerta</DialogTitle>
          {open && <img src={mediaUrl(`/obstacles/photos/${open}`)} alt="Foto do alerta" className="max-h-[75svh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
