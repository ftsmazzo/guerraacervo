import {
  isPlausibleCoverUrl,
  looksLikeEnglish,
  probeCoverUrl,
} from "@/lib/isbn/normalize";
import {
  isPoorSynopsis,
  synopsisQuality,
} from "@/lib/isbn/quality-client";
import { processarTags } from "@/lib/isbn/tags-pt";

export { isPoorSynopsis, synopsisQuality } from "@/lib/isbn/quality-client";

export type CatalogSnippet = {
  titulo: string;
  autor: string;
  editora: string;
  ano: string;
  sinopse: string;
  paginas: number | null;
  idioma: string;
  genero: string;
  capa: string;
  peso: number | null;
  tags: string[];
  fonte: string;
  quality: number;
};

export function recordQuality(r: {
  sinopse: string;
  paginas: number | null;
  idioma: string;
  genero: string;
  editora: string;
  capa: string;
}): number {
  let q = synopsisQuality(r.sinopse);
  if (r.paginas && r.paginas > 0) q += 18;
  if (/portug/i.test(r.idioma)) q += 12;
  else if (/english|inglês/i.test(r.idioma)) q -= 8;
  if (r.genero && r.genero.trim().length > 2) q += 4;
  if (r.editora && r.editora.trim().length > 2) q += 4;
  if (r.capa && isPlausibleCoverUrl(r.capa)) q += 6;
  return q;
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleMatches(a: string, b: string): boolean {
  const fa = fold(a);
  const fb = fold(b);
  if (!fa || !fb) return false;
  if (fa.includes(fb.slice(0, Math.min(12, fb.length)))) return true;
  if (fb.includes(fa.slice(0, Math.min(12, fa.length)))) return true;
  return false;
}

async function safeCover(url: string): Promise<string> {
  if (!url || !isPlausibleCoverUrl(url)) return "";
  if (url.includes("covers.openlibrary.org/b/isbn/")) return "";
  return (await probeCoverUrl(url)) ? url : "";
}

function coverFromImages(images: Record<string, string> | undefined): string {
  if (!images) return "";
  for (const sz of ["extraLarge", "large", "medium", "thumbnail"]) {
    if (images[sz]) {
      return images[sz]
        .replace("http://", "https://")
        .replace("&edge=curl", "")
        .replace("zoom=1", "zoom=3");
    }
  }
  return "";
}

async function fromGoogleBooks(
  query: string,
  expectTitle?: string,
): Promise<CatalogSnippet[]> {
  const out: CatalogSnippet[] = [];
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  const keyQ = key ? `&key=${encodeURIComponent(key)}` : "";
  const urls = [
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&printType=books&langRestrict=pt${keyQ}`,
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&printType=books${keyQ}`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.status === 429) {
        // Cota estourada — não insiste nesta fonte
        break;
      }
      if (!r.ok) continue;
      const data = (await r.json()) as {
        items?: Array<{ volumeInfo?: Record<string, unknown> }>;
        error?: { code?: number };
      };
      if (data.error?.code === 429) break;
      for (const item of data.items || []) {
        const inf = item.volumeInfo;
        if (!inf) continue;
        const titulo = String(inf.title || "");
        if (expectTitle && !titleMatches(titulo, expectTitle)) continue;
        const lang = String(inf.language || "");
        const idioma =
          lang === "pt" || lang === "pt-BR"
            ? "Português"
            : lang === "en"
              ? "Inglês"
              : lang || "";
        const capa = await safeCover(
          coverFromImages(inf.imageLinks as Record<string, string>),
        );
        const sinopse = String(inf.description || "").replace(/<[^>]+>/g, " ");
        const snippet: CatalogSnippet = {
          titulo,
          autor: Array.isArray(inf.authors)
            ? (inf.authors as string[]).join(", ")
            : "",
          editora: String(inf.publisher || ""),
          ano: String(inf.publishedDate || "").match(/\d{4}/)?.[0] || "",
          sinopse,
          paginas: Number(inf.pageCount) || null,
          idioma,
          genero: Array.isArray(inf.categories)
            ? (inf.categories as string[]).slice(0, 3).join(", ")
            : "",
          capa,
          peso: null,
          tags: processarTags(
            Array.isArray(inf.categories) ? (inf.categories as string[]) : [],
          ),
          fonte: "Google Books",
          quality: 0,
        };
        snippet.quality = recordQuality(snippet);
        if (idioma === "Português") snippet.quality += 15;
        if (!isPoorSynopsis(sinopse)) snippet.quality += 10;
        out.push(snippet);
      }
      if (out.some((s) => s.quality >= 50)) break;
    } catch {
      /* next */
    }
  }
  return out;
}

/** Sinopse PT via Wikipedia quando o Google Books falha/cota */
async function fromWikipediaPt(
  titulo: string,
  autor?: string,
): Promise<CatalogSnippet | null> {
  try {
    const q = [titulo, autor].filter(Boolean).join(" ");
    const searchUrl = `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=1&format=json&origin=*`;
    const sRes = await fetch(searchUrl, { cache: "no-store" });
    if (!sRes.ok) return null;
    const sData = (await sRes.json()) as {
      query?: { search?: Array<{ title?: string; snippet?: string }> };
    };
    const hit = (sData.query?.search || []).find((x) =>
      titleMatches(String(x.title || ""), titulo),
    );
    if (!hit?.title) return null;

    const sumUrl = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`;
    const sumRes = await fetch(sumUrl, { cache: "no-store" });
    if (!sumRes.ok) return null;
    const sum = (await sumRes.json()) as {
      extract?: string;
      description?: string;
      thumbnail?: { source?: string };
      title?: string;
    };
    const sinopse = String(sum.extract || "").trim();
    if (sinopse.length < 60) return null;
    const capa = await safeCover(sum.thumbnail?.source || "");
    const snippet: CatalogSnippet = {
      titulo: sum.title || hit.title || titulo,
      autor: autor || "",
      editora: "",
      ano: "",
      sinopse,
      paginas: null,
      idioma: "Português",
      genero: "",
      capa,
      peso: null,
      tags: [],
      fonte: "Wikipedia PT",
      quality: 0,
    };
    snippet.quality = recordQuality(snippet) + 8;
    return snippet;
  } catch {
    return null;
  }
}

/** Descrição mais rica via /works do Open Library */
async function fromOpenLibraryWork(
  titulo: string,
): Promise<CatalogSnippet | null> {
  try {
    const r = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(titulo)}&limit=3&fields=title,author_name,key,cover_i,number_of_pages_median,first_publish_year,publisher`,
      { cache: "no-store" },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as {
      docs?: Array<Record<string, unknown>>;
    };
    const doc = (data.docs || []).find((d) =>
      titleMatches(String(d.title || ""), titulo),
    );
    if (!doc?.key) return null;
    const workKey = String(doc.key); // /works/OLxxxW
    const wRes = await fetch(`https://openlibrary.org${workKey}.json`, {
      cache: "no-store",
    });
    if (!wRes.ok) return null;
    const work = (await wRes.json()) as {
      description?: string | { value?: string };
      subjects?: string[];
    };
    const rawDesc =
      typeof work.description === "string"
        ? work.description
        : work.description?.value || "";
    const sinopse = String(rawDesc).replace(/<[^>]+>/g, " ").trim();
    const coverId = doc.cover_i;
    const capa = coverId
      ? await safeCover(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`)
      : "";
    const tags = processarTags(
      Array.isArray(work.subjects) ? work.subjects.slice(0, 10) : [],
    );
    const snippet: CatalogSnippet = {
      titulo: String(doc.title || titulo),
      autor: Array.isArray(doc.author_name)
        ? (doc.author_name as string[]).join(", ")
        : "",
      editora: Array.isArray(doc.publisher)
        ? String((doc.publisher as string[])[0] || "")
        : "",
      ano: String(doc.first_publish_year || ""),
      sinopse,
      paginas: Number(doc.number_of_pages_median) || null,
      idioma: "",
      genero: tags.slice(0, 2).join(", "),
      capa,
      peso: null,
      tags,
      fonte: "Open Library Work",
      quality: 0,
    };
    snippet.quality = recordQuality(snippet);
    return snippet;
  } catch {
    return null;
  }
}

async function fromOpenLibrary(
  isbn13?: string,
  titulo?: string,
): Promise<CatalogSnippet[]> {
  const out: CatalogSnippet[] = [];
  try {
    if (isbn13) {
      const key = `ISBN:${isbn13}`;
      const r = await fetch(
        `https://openlibrary.org/api/books?bibkeys=${key}&format=json&jscmd=data`,
        { cache: "no-store" },
      );
      if (r.ok) {
        const ol = (await r.json()) as Record<
          string,
          {
            title?: string;
            authors?: Array<{ name?: string }>;
            publishers?: Array<{ name?: string }>;
            publish_date?: string;
            number_of_pages?: number;
            excerpts?: Array<{ text?: string }>;
            subjects?: Array<{ name?: string } | string>;
            cover?: { large?: string; medium?: string };
          }
        >;
        const b = ol[key];
        if (b) {
          const sinopse = b.excerpts?.[0]?.text || "";
          const capa = await safeCover(b.cover?.large || b.cover?.medium || "");
          const tags = processarTags(
            (b.subjects || [])
              .map((s) => (typeof s === "string" ? s : s.name || ""))
              .filter(Boolean),
          );
          const snippet: CatalogSnippet = {
            titulo: b.title || "",
            autor: (b.authors || []).map((a) => a.name || "").join(", "),
            editora: (b.publishers || []).map((p) => p.name || "").join(", "),
            ano: (b.publish_date || "").match(/\d{4}/)?.[0] || "",
            sinopse,
            paginas: b.number_of_pages || null,
            idioma: "",
            genero: tags.slice(0, 2).join(", "),
            capa,
            peso: null,
            tags,
            fonte: "Open Library",
            quality: 0,
          };
          snippet.quality = recordQuality(snippet) - 5; // OL costuma ser mais fraco em sinopse
          out.push(snippet);
        }
      }
    }
    if (titulo) {
      const r = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(titulo)}&limit=4&fields=title,author_name,publisher,first_publish_year,number_of_pages_median,subject,cover_i,language`,
        { cache: "no-store" },
      );
      if (r.ok) {
        const data = (await r.json()) as { docs?: Array<Record<string, unknown>> };
        for (const doc of data.docs || []) {
          const t = String(doc.title || "");
          if (!titleMatches(t, titulo)) continue;
          const coverId = doc.cover_i;
          const capa = coverId
            ? await safeCover(
                `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
              )
            : "";
          const tags = processarTags(
            Array.isArray(doc.subject)
              ? (doc.subject as string[]).slice(0, 8)
              : [],
          );
          const snippet: CatalogSnippet = {
            titulo: t,
            autor: Array.isArray(doc.author_name)
              ? (doc.author_name as string[]).join(", ")
              : "",
            editora: Array.isArray(doc.publisher)
              ? String((doc.publisher as string[])[0] || "")
              : "",
            ano: String(doc.first_publish_year || ""),
            sinopse: "",
            paginas: Number(doc.number_of_pages_median) || null,
            idioma: "",
            genero: tags.slice(0, 2).join(", "),
            capa,
            peso: null,
            tags,
            fonte: "Open Library Search",
            quality: 0,
          };
          snippet.quality = recordQuality(snippet) - 8;
          out.push(snippet);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export type EnrichmentBundle = {
  best: CatalogSnippet | null;
  bestSinopse: string;
  bestPaginas: number | null;
  bestIdioma: string;
  bestGenero: string;
  bestCapa: string;
  bestAno: string;
  bestEditora: string;
  bestTags: string[];
  fontes: string[];
  stage: string;
};

function mergeSnippets(all: CatalogSnippet[]): EnrichmentBundle {
  all.sort((a, b) => b.quality - a.quality);
  const best = all[0] || null;
  const bestSinopse =
    all
      .filter((s) => !isPoorSynopsis(s.sinopse))
      .sort((a, b) => synopsisQuality(b.sinopse) - synopsisQuality(a.sinopse))[0]
      ?.sinopse ||
    best?.sinopse ||
    "";

  return {
    best,
    bestSinopse,
    bestPaginas: all.map((s) => s.paginas).find((p) => p && p > 0) || null,
    bestIdioma:
      all.find((s) => /portug/i.test(s.idioma))?.idioma || best?.idioma || "",
    bestGenero:
      all
        .map((s) => s.genero)
        .find((g) => g && !looksLikeEnglish(g) && g.length > 2) ||
      best?.genero ||
      "",
    bestCapa: all.map((s) => s.capa).find((c) => !!c) || "",
    bestAno: all.map((s) => s.ano).find((a) => /^\d{4}$/.test(a)) || "",
    bestEditora:
      all.map((s) => s.editora).find((e) => e && e.length > 2) || "",
    bestTags: processarTags(all.flatMap((s) => s.tags)).slice(0, 10),
    fontes: [...new Set(all.slice(0, 6).map((s) => s.fonte))],
    stage: "",
  };
}

/** Critério mínimo para “fechar” a devolutiva sem ampliar mais */
export function isEnrichmentSatisfied(input: {
  sinopse: string;
  paginas: number | null;
  idioma?: string;
}): boolean {
  const hasSinopse = !isPoorSynopsis(input.sinopse);
  const hasPages = !!(input.paginas && input.paginas > 0);
  const idiomaOk =
    !input.idioma ||
    /portug/i.test(input.idioma) ||
    input.idioma.trim() === "";
  return hasSinopse && hasPages && idiomaOk;
}

/**
 * Busca em ondas: estreita → amplia → ampla.
 * Para assim que sinopse boa + páginas existirem (melhor custo/latência).
 */
export async function fetchBestCatalogEnrichment(input: {
  titulo: string;
  autor?: string;
  editora?: string;
  isbn13?: string;
}): Promise<EnrichmentBundle> {
  const collected: CatalogSnippet[] = [];
  const seen = new Set<string>();

  const add = (items: CatalogSnippet[]) => {
    for (const it of items) {
      const key = `${it.fonte}|${it.titulo}|${it.sinopse.slice(0, 40)}|${it.paginas}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(it);
    }
  };

  const snapshot = (stage: string): EnrichmentBundle => {
    const bundle = mergeSnippets([...collected]);
    bundle.stage = stage;
    return bundle;
  };

  const goodEnough = () => {
    const b = mergeSnippets([...collected]);
    return isEnrichmentSatisfied({
      sinopse: b.bestSinopse,
      paginas: b.bestPaginas,
      idioma: b.bestIdioma,
    });
  };

  // —— Onda 1: preciso (ISBN + título+autor+editora) ——
  const wave1Queries = [
    input.isbn13 ? `isbn:${input.isbn13}` : "",
    input.editora
      ? `intitle:${input.titulo} inpublisher:${input.editora}`
      : "",
    [input.titulo, input.autor, input.editora].filter(Boolean).join(" "),
  ].filter(Boolean);

  add(
    (
      await Promise.all(
        wave1Queries.map((q) => fromGoogleBooks(q, input.titulo)),
      )
    ).flat(),
  );
  if (input.isbn13) {
    add(await fromOpenLibrary(input.isbn13, undefined));
  }
  if (goodEnough()) {
    const b = snapshot("onda1-precisa");
    return b;
  }

  // —— Onda 2: amplia catálogos ——
  add(await fromGoogleBooks(`intitle:${input.titulo}`, input.titulo));
  add(await fromOpenLibrary(undefined, input.titulo));
  const work = await fromOpenLibraryWork(input.titulo);
  if (work) add([work]);
  if (goodEnough()) {
    return snapshot("onda2-catalogos");
  }

  // —— Onda 3: fontes amplas (Wikipedia + queries soltas) ——
  const wiki = await fromWikipediaPt(input.titulo, input.autor);
  if (wiki) add([wiki]);
  add(
    await fromGoogleBooks(
      `${input.titulo} ${input.autor || ""} livro`.trim(),
      input.titulo,
    ),
  );
  if (input.autor) {
    add(
      await fromGoogleBooks(
        `intitle:${input.titulo} inauthor:${input.autor}`,
        input.titulo,
      ),
    );
  }

  return snapshot("onda3-ampla");
}

/** Aplica enriquecimento só onde o atual está pobre / vazio */
export function applyBestEnrichment<
  T extends {
    sinopse: string;
    paginas: number | null;
    idioma: string;
    genero: string;
    ano: string;
    editora: string;
    capa: string;
    tags: string[];
    avisos: string[];
  },
>(result: T, enrich: EnrichmentBundle) {
  let upgraded = 0;

  if (
    enrich.bestSinopse &&
    (isPoorSynopsis(result.sinopse) ||
      synopsisQuality(enrich.bestSinopse) >
        synopsisQuality(result.sinopse) + 8)
  ) {
    result.sinopse = enrich.bestSinopse;
    upgraded++;
  }

  if ((!result.paginas || result.paginas <= 0) && enrich.bestPaginas) {
    result.paginas = enrich.bestPaginas;
    upgraded++;
  }

  if (
    (!result.idioma || /english|inglês/i.test(result.idioma)) &&
    enrich.bestIdioma
  ) {
    result.idioma = enrich.bestIdioma;
    upgraded++;
  }

  if (
    (!result.genero || looksLikeEnglish(result.genero)) &&
    enrich.bestGenero
  ) {
    result.genero = enrich.bestGenero;
    upgraded++;
  }

  if (!result.ano && enrich.bestAno) {
    result.ano = enrich.bestAno;
    upgraded++;
  }

  if (!result.editora && enrich.bestEditora) {
    result.editora = enrich.bestEditora;
    upgraded++;
  }

  if (
    enrich.bestCapa &&
    (!result.capa || result.capa.includes("covers.openlibrary.org/b/isbn/"))
  ) {
    result.capa = enrich.bestCapa;
    upgraded++;
  }

  if (result.tags.length < 3 && enrich.bestTags.length) {
    result.tags = processarTags([...result.tags, ...enrich.bestTags]);
    upgraded++;
  }

  if (upgraded > 0 && enrich.fontes.length) {
    result.avisos.push(
      `Detalhes reforçados (${enrich.stage}) via ${enrich.fontes.join(" + ")}.`,
    );
  }

  return upgraded;
}
