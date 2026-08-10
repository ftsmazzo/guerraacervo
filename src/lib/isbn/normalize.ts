export type BookLookupResult = {
  titulo: string;
  paginas: number | null;
  autor: string;
  editora: string;
  ano: string;
  sinopse: string;
  capa: string;
  genero: string;
  idioma: string;
  tipoCapa: "Brochura" | "Capa Dura" | null;
  peso: number | null;
  tags: string[];
  _src: string;
};

export function emptyLookup(src = ""): BookLookupResult {
  return {
    titulo: "",
    paginas: null,
    autor: "",
    editora: "",
    ano: "",
    sinopse: "",
    capa: "",
    genero: "",
    idioma: "",
    tipoCapa: null,
    peso: null,
    tags: [],
    _src: src,
  };
}

export const LANG_MAP: Record<string, string> = {
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
  fr: "Francês",
  de: "Alemão",
  it: "Italiano",
  ja: "Japonês",
};

/** Normaliza ISBN-10 → ISBN-13; remove hífens/espaços */
export function normISBN(raw: string): string {
  const isbn = raw.replace(/[-\s]/g, "");
  if (isbn.length === 10) {
    const d = "978" + isbn.slice(0, 9);
    let s = 0;
    for (let i = 0; i < 12; i++) {
      s += parseInt(d[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    return d + String((10 - (s % 10)) % 10);
  }
  return isbn;
}

export function toISBN10(isbn13: string): string | null {
  if (isbn13.length !== 13 || !isbn13.startsWith("978")) return null;
  const core = isbn13.slice(3, 12);
  let s = 0;
  for (let i = 0; i < 9; i++) {
    s += parseInt(core[i], 10) * (10 - i);
  }
  const c = (11 - (s % 11)) % 11;
  return core + (c === 10 ? "X" : String(c));
}

/** Converte string de peso (lb/oz/g) para gramas */
export function parsePeso(weightStr: string): number | null {
  if (!weightStr) return null;
  const lb = weightStr.match(/([\d.]+)\s*(?:pound|lb)/i);
  if (lb) return Math.round(parseFloat(lb[1]) * 453.6);
  const oz = weightStr.match(/([\d.]+)\s*(?:ounce|oz)/i);
  if (oz) return Math.round(parseFloat(oz[1]) * 28.35);
  const g = weightStr.match(/([\d.]+)\s*(?:gram|g)\b/i);
  if (g) return Math.round(parseFloat(g[1]));
  return null;
}

export function detectCapa(
  physFormat: string,
): "Brochura" | "Capa Dura" | null {
  if (!physFormat) return null;
  const lc = physFormat.toLowerCase();
  if (/hardcover|hardback|capa dura/.test(lc)) return "Capa Dura";
  if (/paperback|softcover|brochura|trade/.test(lc)) return "Brochura";
  return null;
}

/** Valida dígito verificador ISBN-10 / ISBN-13 */
export function isValidIsbnChecksum(raw: string): boolean {
  const isbn = raw.replace(/[-\s]/g, "").toUpperCase();
  if (isbn.length === 10) {
    let s = 0;
    for (let i = 0; i < 9; i++) {
      const d = parseInt(isbn[i], 10);
      if (Number.isNaN(d)) return false;
      s += d * (10 - i);
    }
    const check = isbn[9] === "X" ? 10 : parseInt(isbn[9], 10);
    if (Number.isNaN(check)) return false;
    return s % 11 === check;
  }
  if (isbn.length === 13 && /^\d{13}$/.test(isbn)) {
    if (!isbn.startsWith("978") && !isbn.startsWith("979")) return false;
    let s = 0;
    for (let i = 0; i < 12; i++) {
      s += parseInt(isbn[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (s % 10)) % 10;
    return check === parseInt(isbn[12], 10);
  }
  return false;
}

/**
 * Recusa capas inventadas (ex.: URL terminando só com o ISBN)
 * e aceita data URLs / CDNs de imagem conhecidos.
 */
export function isPlausibleCoverUrl(url: string): boolean {
  const u = (url || "").trim();
  if (!u) return false;
  if (u.startsWith("data:image/")) return true;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  const path = parsed.pathname;
  // Path que é só o ISBN (ou /isbn/978…) sem arquivo de imagem
  if (/\/(?:isbn[/-]?)?\d{10,13}\/?$/i.test(path) && !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(path)) {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const trusted =
    /(openlibrary\.org|googleapis\.com|googleusercontent\.com|books\.google|amazon\.|ssl-images-amazon|estantevirtual|skoob|cloudfront|wikimedia|goodreads|static\.|cdn\.)/i.test(
      host,
    );
  const looksImage =
    /\.(jpe?g|png|webp|gif)(\?|$)/i.test(path) ||
    /\/(covers?|images?|img|photos?|media)\b/i.test(path) ||
    parsed.searchParams.has("id") ||
    /zoom=\d/.test(parsed.search);
  return trusted || looksImage;
}

/** Texto parece ISBN (não título). "48 leis do poder" → false */
export function looksLikeIsbnQuery(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const compact = trimmed.replace(/[-\s]/g, "");
  if (/^\d{9}[\dXx]$/i.test(compact)) return true;
  if (/^\d{13}$/.test(compact)) return true;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return false;
  const alnum = trimmed.replace(/[\s\-]/g, "");
  return digits.length / Math.max(alnum.length, 1) >= 0.85;
}

/** Heurística: sinopse/texto predominantemente em inglês */
export function looksLikeEnglish(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length < 40) return false;
  const en = (t.match(/\b(the|and|of|with|from|this|that|his|her|for|are)\b/g) || [])
    .length;
  const pt = (
    t.match(/\b(de|da|do|que|para|com|uma|os|as|não|mais|pelo|pela)\b/g) || []
  ).length;
  return en >= pt + 2;
}

/**
 * Open Library costuma devolver GIF 1×1 para ISBN sem capa.
 * Rejeita respostas miúdas / placeholder.
 */
export async function probeCoverUrl(url: string): Promise<boolean> {
  if (!isPlausibleCoverUrl(url)) return false;
  if (url.startsWith("data:image/")) return true;
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-2048" },
      cache: "no-store",
      redirect: "follow",
    });
    if (!r.ok && r.status !== 206) return false;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength < 800) return false;
    const head = String.fromCharCode(...bytes.subarray(0, 6));
    // GIF89a minúsculo = placeholder OL
    if (head.startsWith("GIF") && bytes.byteLength < 4096) return false;
    return true;
  } catch {
    return false;
  }
}
