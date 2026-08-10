import {
  isPlausibleCoverUrl,
  isValidIsbnChecksum,
  normISBN,
  parsePeso,
  probeCoverUrl,
  toISBN10,
} from "@/lib/isbn/normalize";

function googleBooksKeyQ(): string {
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  return key ? `&key=${encodeURIComponent(key)}` : "";
}

export type EditionHit = {
  isbn13: string;
  titulo: string;
  autor: string;
  editora: string;
  ano: string;
  paginas: number | null;
  capa: string;
  peso: number | null;
  score: number;
  fonte: string;
};

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(fold(a).split(" ").filter((t) => t.length > 2));
  const tb = new Set(fold(b).split(" ").filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

function pickIsbnFromIndustry(
  ids: Array<{ type?: string; identifier?: string }> | undefined,
): string {
  if (!ids?.length) return "";
  const isbn13 = ids.find((x) => x.type === "ISBN_13")?.identifier;
  const isbn10 = ids.find((x) => x.type === "ISBN_10")?.identifier;
  const raw = isbn13 || isbn10 || "";
  if (!raw || !isValidIsbnChecksum(raw.replace(/[^\dXx]/gi, ""))) return "";
  return normISBN(raw.replace(/[^\dXx]/gi, ""));
}

function coverFromImages(images: Record<string, string> | undefined): string {
  if (!images) return "";
  for (const sz of ["extraLarge", "large", "medium", "thumbnail"]) {
    if (images[sz]) {
      const capa = images[sz]
        .replace("http://", "https://")
        .replace("&edge=curl", "")
        .replace("zoom=1", "zoom=3");
      if (isPlausibleCoverUrl(capa)) return capa;
    }
  }
  return "";
}

async function safeCover(url: string): Promise<string> {
  if (!url) return "";
  return (await probeCoverUrl(url)) ? url : "";
}

/**
 * Estimativa prática de sebo quando o catálogo não traz peso.
 * Brochura ~0,9 g/página + capa; dura um pouco mais.
 */
export function estimateWeightGrams(
  paginas: number | null | undefined,
  tipoCapa?: string | null,
): number | null {
  const p = Number(paginas);
  if (!Number.isFinite(p) || p <= 0) return null;
  const hard = /dura|hard/i.test(String(tipoCapa || ""));
  const g = Math.round(p * (hard ? 1.25 : 0.95) + (hard ? 90 : 45));
  return Math.max(80, Math.min(2500, g));
}

/** Confirma ISBN em Google Books ou Open Library; descarta alucinação. */
export async function verifyIsbnExists(isbnRaw: string): Promise<{
  ok: boolean;
  isbn13: string;
  titulo?: string;
  capa?: string;
  paginas?: number | null;
  peso?: number | null;
  editora?: string;
}> {
  const cleaned = isbnRaw.replace(/[^\dXx]/gi, "");
  if (!isValidIsbnChecksum(cleaned)) {
    return { ok: false, isbn13: "" };
  }
  const isbn13 = normISBN(cleaned);
  const isbn10 = toISBN10(isbn13);

  try {
    const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}&maxResults=1${googleBooksKeyQ()}`;
    const gbRes = await fetch(gbUrl, { cache: "no-store" });
    if (gbRes.ok) {
      const gb = (await gbRes.json()) as {
        items?: Array<{ volumeInfo?: Record<string, unknown> }>;
      };
      const inf = gb.items?.[0]?.volumeInfo;
      if (inf?.title) {
        return {
          ok: true,
          isbn13,
          titulo: String(inf.title),
          capa: await safeCover(
            coverFromImages(inf.imageLinks as Record<string, string>),
          ),
          paginas: Number(inf.pageCount) || null,
          editora: String(inf.publisher || ""),
          peso: null,
        };
      }
    }
  } catch {
    /* try OL */
  }

  try {
    const key = `ISBN:${isbn13}`;
    const olUrl = `https://openlibrary.org/api/books?bibkeys=${key}&format=json&jscmd=data`;
    const olRes = await fetch(olUrl, { cache: "no-store" });
    if (olRes.ok) {
      const ol = (await olRes.json()) as Record<
        string,
        {
          title?: string;
          weight?: string;
          number_of_pages?: number;
          publishers?: Array<{ name?: string }>;
          cover?: { large?: string; medium?: string };
        }
      >;
      const b = ol[key];
      if (b?.title) {
        const capaRaw = b.cover?.large || b.cover?.medium || "";
        return {
          ok: true,
          isbn13,
          titulo: b.title,
          capa: await safeCover(capaRaw),
          paginas: b.number_of_pages || null,
          editora: (b.publishers || []).map((p) => p.name || "").join(", "),
          peso: b.weight ? parsePeso(String(b.weight)) : null,
        };
      }
    }
  } catch {
    /* ignore */
  }

  if (isbn10) {
    try {
      const gbRes = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn10}&maxResults=1${googleBooksKeyQ()}`,
        { cache: "no-store" },
      );
      if (gbRes.ok) {
        const gb = (await gbRes.json()) as {
          items?: Array<{ volumeInfo?: { title?: string } }>;
        };
        if (gb.items?.[0]?.volumeInfo?.title) {
          return { ok: true, isbn13 };
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { ok: false, isbn13 };
}

async function searchGoogleBooksCandidates(
  queries: string[],
): Promise<EditionHit[]> {
  const hits: EditionHit[] = [];
  for (const q of queries) {
    if (!q.trim()) continue;
    try {
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=8&printType=books${googleBooksKeyQ()}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const data = (await r.json()) as {
        items?: Array<{ volumeInfo?: Record<string, unknown> }>;
      };
      for (const item of data.items || []) {
        const inf = item.volumeInfo;
        if (!inf) continue;
        const isbn13 = pickIsbnFromIndustry(
          inf.industryIdentifiers as Array<{
            type?: string;
            identifier?: string;
          }>,
        );
        if (!isbn13) continue;
        hits.push({
          isbn13,
          titulo: String(inf.title || ""),
          autor: Array.isArray(inf.authors)
            ? (inf.authors as string[]).join(", ")
            : "",
          editora: String(inf.publisher || ""),
          ano: String(inf.publishedDate || "").match(/\d{4}/)?.[0] || "",
          paginas: Number(inf.pageCount) || null,
          capa: coverFromImages(inf.imageLinks as Record<string, string>),
          peso: null,
          score: 0,
          fonte: "Google Books",
        });
      }
    } catch {
      /* next query */
    }
  }
  return hits;
}

async function searchOpenLibraryCandidates(
  titulo: string,
  autor: string,
  editora: string,
): Promise<EditionHit[]> {
  const hits: EditionHit[] = [];
  try {
    const params = new URLSearchParams({
      title: titulo,
      limit: "8",
      fields:
        "title,author_name,publisher,first_publish_year,number_of_pages_median,cover_i,isbn",
    });
    if (autor) params.set("author", autor);
    const r = await fetch(
      `https://openlibrary.org/search.json?${params.toString()}`,
      { cache: "no-store" },
    );
    if (!r.ok) return hits;
    const data = (await r.json()) as {
      docs?: Array<Record<string, unknown>>;
    };
    for (const doc of data.docs || []) {
      const isbns = Array.isArray(doc.isbn) ? (doc.isbn as string[]) : [];
      let isbn13 = "";
      for (const raw of isbns) {
        const d = String(raw).replace(/[^\dXx]/gi, "");
        if (isValidIsbnChecksum(d)) {
          isbn13 = normISBN(d);
          break;
        }
      }
      if (!isbn13) continue;
      const coverId = doc.cover_i;
      const pubs = Array.isArray(doc.publisher)
        ? (doc.publisher as string[]).join(", ")
        : "";
      hits.push({
        isbn13,
        titulo: String(doc.title || ""),
        autor: Array.isArray(doc.author_name)
          ? (doc.author_name as string[]).join(", ")
          : "",
        editora: pubs,
        ano: String(doc.first_publish_year || ""),
        paginas: Number(doc.number_of_pages_median) || null,
        capa: coverId
          ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
          : "",
        peso: null,
        score: 0,
        fonte: "Open Library",
      });
      void editora;
    }
  } catch {
    /* ignore */
  }
  return hits;
}

function scoreHit(
  hit: EditionHit,
  titulo: string,
  autor: string,
  editora: string,
): number {
  let s = 0;
  s += tokenOverlap(hit.titulo, titulo) * 50;
  if (autor) s += tokenOverlap(hit.autor, autor) * 20;
  if (editora) {
    const ed = tokenOverlap(hit.editora, editora);
    s += ed * 45;
    if (fold(hit.editora).includes(fold(editora).slice(0, 5))) s += 20;
    // Editora informada mas candidato de outra casa → descartar na prática
    if (ed < 0.2 && !fold(hit.editora).includes(fold(editora).slice(0, 5))) {
      s -= 60;
    }
  }
  if (hit.isbn13.startsWith("97885")) s += 8;
  if (hit.paginas && hit.paginas > 0) s += 2;
  if (hit.capa) s += 2;
  return s;
}

/**
 * Resolve ISBN pela ficha (título + editora + autor), como uma busca
 * humana no Google: tenta várias queries e escolhe o melhor match.
 */
export async function resolveIsbnByMetadata(input: {
  titulo: string;
  autor?: string;
  editora?: string;
  colecao?: string;
}): Promise<EditionHit | null> {
  const titulo = input.titulo.trim();
  if (titulo.length < 3) return null;
  const autor = (input.autor || "").trim();
  const editora = (input.editora || "").trim();
  const colecao = (input.colecao || "").trim();

  const queries = [
    editora
      ? `intitle:${titulo} inpublisher:${editora}`
      : `intitle:${titulo}`,
    [titulo, autor, editora].filter(Boolean).join(" "),
    [titulo, editora, colecao, "ISBN"].filter(Boolean).join(" "),
    [titulo, editora, "Brasil"].filter(Boolean).join(" "),
    autor ? `intitle:${titulo} inauthor:${autor}` : "",
  ].filter(Boolean);

  const [gb, ol] = await Promise.all([
    searchGoogleBooksCandidates(queries),
    searchOpenLibraryCandidates(titulo, autor, editora),
  ]);

  const byIsbn = new Map<string, EditionHit>();
  for (const h of [...gb, ...ol]) {
    const scored = { ...h, score: scoreHit(h, titulo, autor, editora) };
    const prev = byIsbn.get(h.isbn13);
    if (!prev || scored.score > prev.score) byIsbn.set(h.isbn13, scored);
  }

  const ranked = [...byIsbn.values()].sort((a, b) => b.score - a.score);

  // Se a editora foi informada, só aceita match com editora compatível
  const pool = editora
    ? ranked.filter((h) => {
        const ed = tokenOverlap(h.editora, editora);
        return (
          ed >= 0.2 || fold(h.editora).includes(fold(editora).slice(0, 5))
        );
      })
    : ranked;

  const best = (pool.length ? pool : [])[0];
  // Sem editora compatível nos catálogos → null (deixa a busca web aberta resolver)
  if (editora && !best) return null;
  const pick = best || ranked[0];
  if (!pick || pick.score < 28) return null;

  // Confirma existência
  const verified = await verifyIsbnExists(pick.isbn13);
  if (!verified.ok) return null;

  return {
    ...pick,
    isbn13: verified.isbn13,
    capa: (await safeCover(pick.capa || verified.capa || "")) || "",
    paginas: pick.paginas || verified.paginas || null,
    peso: pick.peso || verified.peso || null,
    editora: pick.editora || verified.editora || editora,
  };
}

/** Busca capa real por título+autor quando não há ISBN confiável */
export async function findCoverByTitleAuthor(
  titulo: string,
  autor: string,
  editora?: string,
): Promise<string> {
  const hit = await resolveIsbnByMetadata({ titulo, autor, editora });
  if (hit?.capa && isPlausibleCoverUrl(hit.capa)) return hit.capa;

  const q = [titulo, autor, editora].filter(Boolean).join(" ").trim();
  if (q.length < 3) return "";

  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&langRestrict=pt${googleBooksKeyQ()}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return "";
    const data = (await r.json()) as {
      items?: Array<{ volumeInfo?: Record<string, unknown> }>;
    };
    for (const item of data.items || []) {
      const capa = coverFromImages(
        item.volumeInfo?.imageLinks as Record<string, string>,
      );
      if (capa) return capa;
    }
  } catch {
    /* ignore */
  }

  return "";
}
