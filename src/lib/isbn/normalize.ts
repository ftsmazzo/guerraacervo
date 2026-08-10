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
