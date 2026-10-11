/** Foto de perfil: recorta o centro em quadrado, reduz para `size` px e devolve um JPEG pequeno (data URL, ~15–30 KB). */
export async function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem");
  if (file.size > 15 * 1024 * 1024) throw new Error("A imagem é grande demais (máximo 15 MB)");

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível ler essa imagem"));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Seu navegador não conseguiu processar a imagem");
    ctx.fillStyle = "#0f172a"; // fundo para PNG com transparência
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const PHOTO_MAX_CHARS = 420_000; // o servidor aceita até ~450 mil caracteres por foto

/** JPEG do canvas, baixando a qualidade até caber no limite do servidor. */
export function canvasToPhotoDataUrl(canvas: HTMLCanvasElement): string {
  for (const q of [0.78, 0.65, 0.5, 0.38]) {
    const data = canvas.toDataURL("image/jpeg", q);
    if (data.length <= PHOTO_MAX_CHARS) return data;
  }
  throw new Error("Não foi possível reduzir essa foto. Tente outra.");
}

/**
 * Foto de comprovação: reduz para no máximo `maxSide` px no lado maior e devolve um JPEG (data URL, ~100–250 KB).
 * Ao redesenhar no canvas os metadados da câmera (inclusive a localização EXIF) são descartados.
 */
export async function fileToPhotoDataUrl(file: File, maxSide = 1280): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma foto (vídeos ainda não são aceitos)");
  if (file.size > 25 * 1024 * 1024) throw new Error("A foto é grande demais (máximo 25 MB)");

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível ler essa foto"));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Seu navegador não conseguiu processar a foto");
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvasToPhotoDataUrl(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
