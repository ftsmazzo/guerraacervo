import { looksLikeEnglish } from "@/lib/isbn/normalize";

/** Sinopse curta, genérica ou em inglês = pobre para sebo BR (browser-safe) */
export function isPoorSynopsis(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 90) return true;
  if (looksLikeEnglish(t)) return true;
  if (/^(n\/?a|sem (descri|sinopse)|description not available|lorem)/i.test(t)) {
    return true;
  }
  return false;
}

export function synopsisQuality(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  let q = Math.min(40, Math.floor(t.length / 10));
  if (looksLikeEnglish(t)) q = Math.floor(q * 0.25);
  else q += 25; // bônus PT
  if (t.length >= 200) q += 10;
  if (t.length >= 400) q += 5;
  return q;
}
