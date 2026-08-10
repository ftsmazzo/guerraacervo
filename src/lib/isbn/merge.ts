import type { BookLookupResult } from "@/lib/isbn/normalize";

export type MergedBookData = {
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
  fontes: string[];
};

/**
 * Merge multi-fonte.
 * Ordem esperada: [google, openlib, hathi, ml, olsearch, php]
 * Inclui o scraper PHP nas prioridades (corrige bug legado do form.php
 * que recebia 6 fontes mas só priorizava 5).
 */
export function mergeData(
  sources: Array<BookLookupResult | null | undefined>,
): MergedBookData | null {
  const [g, o, h, m, s, p] = sources;
  const valid = sources.filter(Boolean) as BookLookupResult[];
  if (!valid.length) return null;

  const longest = (...vals: Array<string | null | undefined>) =>
    vals
      .filter((v): v is string => !!v && String(v).trim().length > 0)
      .reduce((a, b) => (a.length >= b.length ? a : b), "");

  const pickNum = (...vals: Array<number | null | undefined>) =>
    vals.find((v) => v != null && Number(v) > 0) ?? null;

  const pickStr = (...vals: Array<string | null | undefined>) =>
    vals.find((v) => v && String(v).trim()) || "";

  return {
    titulo: longest(
      g?.titulo,
      m?.titulo,
      p?.titulo,
      o?.titulo,
      s?.titulo,
      h?.titulo,
    ),
    paginas: pickNum(o?.paginas, s?.paginas, g?.paginas, m?.paginas, p?.paginas),
    autor: longest(
      o?.autor,
      g?.autor,
      p?.autor,
      s?.autor,
      m?.autor,
      h?.autor,
    ),
    editora: longest(
      m?.editora,
      p?.editora,
      g?.editora,
      o?.editora,
      s?.editora,
    ),
    ano: pickStr(g?.ano, o?.ano, m?.ano, p?.ano, s?.ano, h?.ano),
    sinopse: longest(g?.sinopse, m?.sinopse, p?.sinopse, o?.sinopse),
    capa: pickStr(g?.capa, m?.capa, p?.capa, o?.capa, s?.capa),
    genero: longest(g?.genero, o?.genero, s?.genero, m?.genero, p?.genero),
    idioma: pickStr(g?.idioma, m?.idioma, p?.idioma),
    tipoCapa: o?.tipoCapa || p?.tipoCapa || null,
    peso: o?.peso || p?.peso || null,
    tags: [...new Set(valid.flatMap((src) => src.tags || []))],
    fontes: valid.map((src) => src._src),
  };
}

/** Alias para o form client — nunca null; inclui `_src` concatenado */
export function mergeLookupData(
  sources: Array<BookLookupResult | null | undefined>,
): MergedBookData & { _src: string } {
  const merged = mergeData(sources);
  if (!merged) {
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
      fontes: [],
      _src: "",
    };
  }
  return { ...merged, _src: merged.fontes.join(" + ") };
}
