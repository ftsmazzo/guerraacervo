/** Bounding box da capa em frações 0–1 da imagem original */
export type CoverBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const COVER_CROP_SCHEMA = {
  name: "cover_crop_bbox",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      x: {
        type: "number",
        description: "Esquerda da capa (0–1)",
      },
      y: {
        type: "number",
        description: "Topo da capa (0–1)",
      },
      width: {
        type: "number",
        description: "Largura da capa (0–1)",
      },
      height: {
        type: "number",
        description: "Altura da capa (0–1)",
      },
      confianca: {
        type: "number",
        description: "0–1 certeza do recorte",
      },
    },
    required: ["x", "y", "width", "height", "confianca"],
  },
} as const;

export function clampBBox(raw: Partial<CoverBBox>): CoverBBox | null {
  const x = Number(raw.x);
  const y = Number(raw.y);
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  const cx = Math.min(0.95, Math.max(0, x));
  const cy = Math.min(0.95, Math.max(0, y));
  const cw = Math.min(1 - cx, Math.max(0.15, width));
  const ch = Math.min(1 - cy, Math.max(0.2, height));
  if (cw < 0.15 || ch < 0.2) return null;
  return { x: cx, y: cy, width: cw, height: ch };
}

/** Fallback: centro ~2:3 com corte de bordas (~8–12%). */
export function fallbackBookBBox(): CoverBBox {
  return { x: 0.1, y: 0.06, width: 0.8, height: 0.88 };
}

export function isHttpCoverUrl(url: string): boolean {
  const u = (url || "").trim();
  return /^https?:\/\//i.test(u);
}

export function isDataCoverUrl(url: string): boolean {
  return (url || "").trim().startsWith("data:image/");
}
