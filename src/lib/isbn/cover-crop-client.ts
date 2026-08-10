import {
  clampBBox,
  fallbackBookBBox,
  type CoverBBox,
} from "@/lib/isbn/cover-crop";

/** Recorta data-URL JPEG/PNG no browser conforme bbox fracionário. */
export async function cropDataUrlToCover(
  dataUrl: string,
  bbox: CoverBBox,
  maxSide = 640,
): Promise<string> {
  const box = clampBBox(bbox) || fallbackBookBBox();
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Imagem inválida para crop"));
    el.src = dataUrl;
  });

  const sx = Math.round(box.x * img.width);
  const sy = Math.round(box.y * img.height);
  const sw = Math.max(1, Math.round(box.width * img.width));
  const sh = Math.max(1, Math.round(box.height * img.height));

  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

  let q = 0.82;
  let out = canvas.toDataURL("image/jpeg", q);
  while (out.length > 700_000 && q > 0.45) {
    q -= 0.08;
    out = canvas.toDataURL("image/jpeg", q);
  }
  return out;
}

export async function cropWithFallback(dataUrl: string): Promise<string> {
  try {
    return await cropDataUrlToCover(dataUrl, fallbackBookBBox());
  } catch {
    return dataUrl;
  }
}
