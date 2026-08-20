import type { LoanConditionCheck } from "@/db/schema";

export const MAX_LOAN_PHOTO_CHARS = 700_000;

export const EMPTY_LOAN_CONDITION: LoanConditionCheck = {
  tornPages: false,
  missingPages: false,
  marksOrStains: false,
  coverDamage: false,
  notes: "",
};

export const LOAN_CONDITION_LABELS: {
  key: keyof Omit<LoanConditionCheck, "notes">;
  label: string;
}[] = [
  { key: "tornPages", label: "Folhas rasgadas" },
  { key: "missingPages", label: "Folhas faltando" },
  { key: "marksOrStains", label: "Marcas ou manchas" },
  { key: "coverDamage", label: "Capa danificada" },
];

export function normalizeLoanCondition(
  input: unknown,
): LoanConditionCheck | null {
  if (input == null) return null;
  if (typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const notes = String(o.notes ?? "").trim().slice(0, 500);
  return {
    tornPages: Boolean(o.tornPages),
    missingPages: Boolean(o.missingPages),
    marksOrStains: Boolean(o.marksOrStains),
    coverDamage: Boolean(o.coverDamage),
    notes,
  };
}

export function normalizeLoanPhoto(url: unknown): string | null {
  if (url == null || url === "") return null;
  const s = String(url).trim();
  if (!s.startsWith("data:image/")) {
    throw new Error("Foto inválida (use imagem da câmera ou galeria).");
  }
  if (s.length > MAX_LOAN_PHOTO_CHARS) {
    throw new Error("Foto grande demais. Tire de novo mais de perto.");
  }
  return s;
}

/** Reduz arquivo para data-URL usável no balcão. */
export async function fileToLoanPhotoDataUrl(
  file: File,
  maxSide = 960,
): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Imagem inválida"));
      el.src = raw;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (raw.length > MAX_LOAN_PHOTO_CHARS) {
        throw new Error("Foto grande demais.");
      }
      return raw;
    }
    ctx.drawImage(img, 0, 0, w, h);
    let quality = 0.72;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > MAX_LOAN_PHOTO_CHARS && quality > 0.4) {
      quality -= 0.1;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    if (out.length > MAX_LOAN_PHOTO_CHARS) {
      throw new Error("Foto grande demais após compressão.");
    }
    return out;
  } catch (e) {
    if (e instanceof Error && /grande|inválida/i.test(e.message)) throw e;
    if (raw.length > MAX_LOAN_PHOTO_CHARS) {
      throw new Error("Foto grande demais.");
    }
    return raw;
  }
}
