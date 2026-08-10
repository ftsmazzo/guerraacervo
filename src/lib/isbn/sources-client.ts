import {
  detectCapa,
  emptyLookup,
  LANG_MAP,
  parsePeso,
  toISBN10,
  type BookLookupResult,
} from "@/lib/isbn/normalize";
import { processarTags } from "@/lib/isbn/tags-pt";

export type { BookLookupResult };

export async function fetchGoogle(
  isbn: string,
): Promise<BookLookupResult | null> {
  const isbn10 = toISBN10(isbn);
  const queries = [`isbn:${isbn}`, isbn10 ? `isbn:${isbn10}` : null, isbn].filter(
    Boolean,
  ) as string[];
  for (const q of queries) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`,
      );
      const d = await r.json();
      if (!d.items?.length) continue;
      const inf = d.items[0].volumeInfo;
      let capa = "";
      if (inf.imageLinks) {
        const raw =
          inf.imageLinks.extraLarge ||
          inf.imageLinks.large ||
          inf.imageLinks.medium ||
          inf.imageLinks.thumbnail ||
          "";
        capa = raw
          .replace("http://", "https://")
          .replace("&edge=curl", "")
          .replace("zoom=1", "zoom=3");
      }
      const titulo = inf.subtitle
        ? `${inf.title}: ${inf.subtitle}`
        : inf.title || "";
      return {
        ...emptyLookup("Google Books"),
        titulo,
        paginas: inf.pageCount || null,
        autor: (inf.authors || []).join(", "),
        editora: inf.publisher || "",
        ano: (inf.publishedDate || "").match(/\d{4}/)?.[0] || "",
        sinopse: inf.description || "",
        capa,
        genero: (inf.categories || []).join(", "),
        idioma: LANG_MAP[inf.language] || inf.language || "",
        tags: processarTags(inf.categories || []),
        _src: "Google Books",
      };
    } catch {
      /* next */
    }
  }
  return null;
}

export async function fetchOpenLibrary(
  isbn: string,
): Promise<BookLookupResult | null> {
  try {
    const r = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
    );
    const d = await r.json();
    const b = d[`ISBN:${isbn}`];
    if (!b) return null;
    const capa =
      b.cover?.large ||
      b.cover?.medium ||
      `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    const rawSubjects = (b.subjects || []).map((s: { name?: string } | string) =>
      typeof s === "string" ? s : s.name || "",
    ).slice(0, 10);
    let extra: Record<string, unknown> = {};
    const olid = String(b.key || "").replace("/books/", "");
    if (olid) {
      try {
        const r2 = await fetch(`https://openlibrary.org/books/${olid}.json`);
        extra = await r2.json();
      } catch {
        /* ignore */
      }
    }
    const pesoRaw = (b.weight || extra.weight || null) as string | null;
    const physFmt = String(b.physical_format || extra.physical_format || "");
    return {
      ...emptyLookup("Open Library"),
      titulo: b.title || "",
      paginas:
        (b.number_of_pages as number) ||
        (extra.number_of_pages as number) ||
        null,
      autor: (b.authors || []).map((a: { name: string }) => a.name).join(", "),
      editora: (b.publishers || [])
        .map((p: { name: string }) => p.name)
        .join(", "),
      ano: String(b.publish_date || "").match(/\d{4}/)?.[0] || "",
      sinopse: (b.excerpts || [])[0]?.text || "",
      capa,
      genero: rawSubjects.slice(0, 3).join(", "),
      tipoCapa: detectCapa(physFmt),
      peso: parsePeso(String(pesoRaw || "")),
      tags: processarTags(rawSubjects),
      _src: "Open Library",
    };
  } catch {
    return null;
  }
}

export async function fetchHathiTrust(
  isbn: string,
): Promise<BookLookupResult | null> {
  try {
    const r = await fetch(
      `https://catalog.hathitrust.org/api/volumes/brief/isbn/${isbn}.json`,
    );
    const d = await r.json();
    const records = Object.values(d.records || {}) as Array<{
      titles?: string[];
      authors?: string;
      publishDate?: string;
    }>;
    if (!records.length) return null;
    const rec = records[0];
    const titulo = (rec.titles || [])[0]?.replace(/\s*\/\s*$/, "") || "";
    if (!titulo) return null;
    return {
      ...emptyLookup("HathiTrust"),
      titulo,
      autor: rec.authors || "",
      ano: rec.publishDate || "",
      _src: "HathiTrust",
    };
  } catch {
    return null;
  }
}

export async function fetchMercadoLivre(
  isbn: string,
): Promise<BookLookupResult | null> {
  try {
    const r = await fetch(
      `https://api.mercadolibre.com/sites/MLB/search?q=${isbn}&limit=5`,
    );
    const d = await r.json();
    if (!d.results?.length) return null;
    const item =
      d.results.find(
        (it: {
          attributes?: { id: string; value_name?: string }[];
          title?: string;
        }) => {
          const attrs: Record<string, string> = {};
          (it.attributes || []).forEach(
            (a) => (attrs[a.id] = a.value_name || ""),
          );
          const isbnAttr = attrs.ISBN || attrs.GTIN || "";
          return isbnAttr === isbn || it.title?.includes(isbn);
        },
      ) || d.results[0];

    const attrs: Record<string, string> = {};
    (item.attributes || []).forEach(
      (a: { id: string; value_name?: string }) =>
        (attrs[a.id] = a.value_name || ""),
    );

    let name = "";
    let desc = "";
    let bestCapa = "";
    if (item.catalog_product_id) {
      try {
        const cr = await fetch(
          `https://api.mercadolibre.com/catalog_products/${item.catalog_product_id}`,
        );
        const cd = await cr.json();
        name = cd.name || "";
        desc = cd.short_description || "";
        if (cd.pictures?.length) {
          bestCapa = (cd.pictures[0].url || "")
            .replace(/\d+x\d+/, "600x600")
            .replace("I.jpg", "O.jpg");
        }
      } catch {
        /* ignore */
      }
    }
    if (!bestCapa && item.thumbnail) {
      bestCapa = String(item.thumbnail)
        .replace("I.jpg", "O.jpg")
        .replace(/\/\d+\//, "/600/");
    }

    return {
      ...emptyLookup("Mercado Livre"),
      titulo: name || attrs.BOOK_TITLE || item.title || "",
      paginas: parseInt(attrs.NUMBER_OF_PAGES, 10) || null,
      autor: attrs.AUTHOR || attrs.AUTHORS || "",
      editora: attrs.BRAND || attrs.PUBLISHER || attrs.EDITORIAL || "",
      ano: attrs.PUBLICATION_YEAR || attrs.YEAR || "",
      sinopse: desc,
      capa: bestCapa,
      genero: attrs.GENRE || attrs.LITERARY_GENRE || "",
      idioma: "Português",
      _src: "Mercado Livre",
    };
  } catch {
    return null;
  }
}

export async function fetchOpenLibrarySearch(
  isbn: string,
): Promise<BookLookupResult | null> {
  try {
    const r = await fetch(
      `https://openlibrary.org/search.json?isbn=${isbn}&limit=1&fields=title,author_name,publisher,first_publish_year,number_of_pages_median,subject,cover_i`,
    );
    const d = await r.json();
    if (!d.docs?.length) return null;
    const doc = d.docs[0];
    const coverId = doc.cover_i;
    return {
      ...emptyLookup("OL Search"),
      titulo: doc.title || "",
      autor: (doc.author_name || []).join(", "),
      editora: (doc.publisher || []).slice(0, 2).join(", "),
      ano: String(doc.first_publish_year || ""),
      paginas: doc.number_of_pages_median || null,
      capa: coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
        : "",
      tags: processarTags(doc.subject || []),
      _src: "OL Search",
    };
  } catch {
    return null;
  }
}

export async function fetchPhpScraper(
  isbn: string,
): Promise<BookLookupResult | null> {
  try {
    const r = await fetch(`/api/isbn/lookup?isbn=${encodeURIComponent(isbn)}`);
    const d = await r.json();
    if (!d.encontrado || !d.titulo) return null;
    return {
      ...emptyLookup("BR Scraper"),
      titulo: d.titulo || "",
      paginas: d.paginas || null,
      autor: d.autor || "",
      editora: d.editora || "",
      ano: d.ano || "",
      sinopse: d.sinopse || "",
      capa: d.capa || "",
      genero: d.genero || "",
      idioma: d.idioma || "Português",
      _src: "🇧🇷 " + (d.fontes || []).join(" + "),
    };
  } catch {
    return null;
  }
}
