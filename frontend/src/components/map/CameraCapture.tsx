import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canvasToPhotoDataUrl } from "@/lib/image";

interface Props {
  open: boolean;
  onClose: () => void;
  /** recebe a foto já reduzida (JPEG data URL, sem metadados) */
  onCapture: (dataUrl: string) => void;
  /** a câmera do navegador não abriu (sem permissão/sem suporte): o pai usa o seletor nativo como plano B */
  onUnavailable: () => void;
}

/**
 * Câmera dentro do próprio app: mostra a imagem ao vivo e tira a foto sem precisar sair para a galeria.
 * Fica em tela cheia por um portal (o diálogo de reporte tem transform, que quebraria um `fixed` aninhado).
 */
export default function CameraCapture({ open, onClose, onCapture, onUnavailable }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      unavailableRef.current();
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) unavailableRef.current();
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop()); // desliga a câmera (luz do aparelho)
      streamRef.current = null;
    };
  }, [open, facing]);

  if (!open) return null;

  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    try {
      onCapture(canvasToPhotoDataUrl(canvas));
    } finally {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[3500] flex flex-col bg-black pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      role="dialog"
      aria-label="Câmera"
      data-testid="camera-capture"
    >
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {!ready && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">Abrindo a câmera…</p>}
        <Button variant="secondary" size="icon-lg" className="absolute left-3 top-3 rounded-full bg-black/60 text-white" onClick={onClose} aria-label="Fechar câmera" data-testid="camera-close">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex items-center justify-around bg-black px-6 py-5">
        <span className="h-12 w-12" />
        <button
          type="button"
          onClick={shoot}
          disabled={!ready}
          aria-label="Tirar foto"
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform active:scale-90 disabled:opacity-40"
          data-testid="camera-shoot"
        >
          <Camera className="h-7 w-7 text-white" />
        </button>
        <button
          type="button"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          aria-label="Trocar de câmera"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white"
          data-testid="camera-flip"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
