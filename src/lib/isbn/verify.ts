import {
  isPlausibleCoverUrl,
  isValidIsbnChecksum,
  normISBN,
  toISBN10,
} from "@/lib/isbn/normalize";

/** Confirma ISBN em Google Books ou Open Library; descarta alucinação. */
export async function verifyIsbnExists(isbnRaw: string): Promise<{
  ok: boolean;
  isbn13: string;
  titulo?: string;
  capa?: string;
}> {
  const cleaned = isbnRaw.replace(/[^\dXx]/gi, "");
  if (!isValidIsbnChecksum(cleaned)) {
    return { ok: false, isbn13: "" };
  }
  const isbn13 = normISBN(cleaned);
  const isbn10 = toISBN10(isbn13);

  try {
    const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}&maxResults=1`;
    const gbRes = await fetch(gbUrl, { cache: "no-store" });
    if (gbRes.ok) {
      const gb = (await gbRes.json()) as {
        items?: Array<{ volumeInfo?: Record<string, unknown> }>;
      };
      const inf = gb.items?.[0]?.volumeInfo;
      if (inf?.title) {
        const images = (inf.imageLinks || {}) as Record<string, string>;
        let capa = "";
        for (const sz of ["extraLarge", "large", "medium", "thumbnail"]) {
          if (images[sz]) {
            capa = images[sz]
              .replace("http://", "https://")
              .replace("&edge=curl", "")
              .replace("zoom=1", "zoom=3");
            break;
          }
        }
        return {
          ok: true,
          isbn13,
          titulo: String(inf.title),
          capa: isPlausibleCoverUrl(capa) ? capa : "",
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
          cover?: { large?: string; medium?: string };
        }
      >;
      const b = ol[key];
      if (b?.title) {
        const capa = b.cover?.large || b.cover?.medium || "";
        return {
          ok: true,
          isbn13,
          titulo: b.title,
          capa: isPlausibleCoverUrl(capa) ? capa : "",
        };
      }
    }
  } catch {
    /* ignore */
  }

  // Tentativa ISBN-10 no Google
  if (isbn10) {
    try {
      const gbRes = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn10}&maxResults=1`,
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

/** Busca capa real por título+autor quando não há ISBN confiável */
export async function findCoverByTitleAuthor(
  titulo: string,
  autor: string,
): Promise<string> {
  const q = [titulo, autor].filter(Boolean).join(" ").trim();
  if (q.length < 3) return "";

  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&langRestrict=pt`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return "";
    const data = (await r.json()) as {
      items?: Array<{ volumeInfo?: Record<string, unknown> }>;
    };
    const tNorm = titulo.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    for (const item of data.items || []) {
      const inf = item.volumeInfo;
      if (!inf) continue;
      const title = String(inf.title || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "");
      if (!title.includes(tNorm.slice(0, Math.min(12, tNorm.length))) && !tNorm.includes(title.slice(0, 12))) {
        continue;
      }
      const images = (inf.imageLinks || {}) as Record<string, string>;
      for (const sz of ["extraLarge", "large", "medium", "thumbnail"]) {
        if (images[sz]) {
          const capa = images[sz]
            .replace("http://", "https://")
            .replace("&edge=curl", "")
            .replace("zoom=1", "zoom=3");
          if (isPlausibleCoverUrl(capa)) return capa;
        }
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(titulo)}&author=${encodeURIComponent(autor || "")}&limit=3&fields=title,cover_i`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return "";
    const data = (await r.json()) as {
      docs?: Array<{ cover_i?: number }>;
    };
    const coverId = data.docs?.[0]?.cover_i;
    if (coverId) {
      const capa = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
      if (isPlausibleCoverUrl(capa)) return capa;
    }
  } catch {
    /* ignore */
  }

  return "";
}
