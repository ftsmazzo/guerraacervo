import { NextResponse } from "next/server";
import { LANG_MAP, normISBN, toISBN10 } from "@/lib/isbn/normalize";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type PartialBook = {
  titulo?: string;
  autor?: string;
  editora?: string;
  ano?: string;
  sinopse?: string;
  capa?: string;
  genero?: string;
  idioma?: string;
  paginas?: number | null;
  _src?: string;
};

async function httpGet(url: string, timeoutMs = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });
    return await r.text();
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

function jsonLD(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const d = JSON.parse(m[1].trim()) as unknown;
      if (Array.isArray(d)) {
        for (const item of d) {
          if (item && typeof item === "object")
            out.push(item as Record<string, unknown>);
        }
      } else if (d && typeof d === "object") {
        out.push(d as Record<string, unknown>);
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

function openGraph(html: string): Record<string, string> {
  const og: Record<string, string> = {};
  const tags = html.match(/<meta[^>]+>/gi) || [];
  for (const tag of tags) {
    const prop = tag.match(/property=["']og:([^"']+)["']/i);
    const cont = tag.match(/content=["']([^"']*)["']/i);
    if (prop && cont) {
      og[prop[1]] = cont[1]
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }
  }
  return og;
}

function parseJsonLD(objects: Record<string, unknown>[]): PartialBook {
  const bookTypes = new Set(["Book", "Product", "ItemPage"]);
  for (const obj of objects) {
    const typ = obj["@type"];
    const typeStr = Array.isArray(typ) ? String(typ[0]) : String(typ || "");
    if (!bookTypes.has(typeStr)) continue;

    const d: PartialBook = {};
    d.titulo = String(obj.name || "").trim();
    d.sinopse = String(obj.description || "").trim();
    const pages = Number(obj.numberOfPages || 0);
    d.paginas = pages > 0 ? pages : null;

    const img = obj.image;
    if (Array.isArray(img)) {
      const first = img[0] as string | { url?: string };
      d.capa =
        typeof first === "string" ? first : String(first?.url || "");
    } else if (img && typeof img === "object") {
      d.capa = String((img as { url?: string }).url || "");
    } else {
      d.capa = String(img || "");
    }

    const a = obj.author;
    if (Array.isArray(a)) {
      d.autor = a
        .map((x) =>
          typeof x === "string"
            ? x
            : String((x as { name?: string })?.name || ""),
        )
        .filter(Boolean)
        .join(", ");
    } else if (a && typeof a === "object") {
      d.autor = String((a as { name?: string }).name || "");
    } else if (a) {
      d.autor = String(a);
    }

    const p = obj.publisher;
    if (p && typeof p === "object") {
      d.editora = String((p as { name?: string }).name || "");
    } else if (p) {
      d.editora = String(p);
    }

    const yearMatch = String(obj.datePublished || "").match(/\d{4}/);
    d.ano = yearMatch?.[0] || "";

    const filled = Object.values(d).filter((v) => v !== null && v !== "");
    if (filled.length >= 2) return d;
  }
  return {};
}

function nonempty(d: PartialBook): PartialBook | null {
  const cleaned: PartialBook = {};
  for (const [k, v] of Object.entries(d)) {
    if (v !== null && v !== undefined && v !== "") {
      (cleaned as Record<string, unknown>)[k] = v;
    }
  }
  return Object.keys(cleaned).length ? cleaned : null;
}

async function srcGoogleBooks(isbn13: string, isbn10: string | null) {
  const urls = [
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}&maxResults=1`,
    isbn10
      ? `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn10}&maxResults=1`
      : "",
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(isbn13)}&maxResults=1&langRestrict=pt`,
  ].filter(Boolean);

  for (const url of urls) {
    try {
      const raw = await httpGet(url, 10000);
      const data = JSON.parse(raw) as {
        items?: Array<{ volumeInfo?: Record<string, unknown> }>;
      };
      const inf = data.items?.[0]?.volumeInfo;
      if (!inf) continue;

      const imageLinks = (inf.imageLinks || {}) as Record<string, string>;
      let capa = "";
      for (const sz of [
        "extraLarge",
        "large",
        "medium",
        "small",
        "thumbnail",
      ]) {
        if (imageLinks[sz]) {
          capa = imageLinks[sz]
            .replace("http://", "https://")
            .replace("&edge=curl", "")
            .replace("zoom=1", "zoom=3");
          break;
        }
      }
      if (!capa) {
        capa = `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`;
      }

      const lang = String(inf.language || "");
      return nonempty({
        titulo: String(inf.title || ""),
        autor: Array.isArray(inf.authors)
          ? (inf.authors as string[]).join(", ")
          : "",
        editora: String(inf.publisher || ""),
        ano: String(inf.publishedDate || "").match(/\d{4}/)?.[0] || "",
        sinopse: String(inf.description || ""),
        capa,
        paginas: Number(inf.pageCount) || null,
        genero: Array.isArray(inf.categories)
          ? (inf.categories as string[]).join(", ")
          : "",
        idioma: LANG_MAP[lang] || "",
        _src: "Google Books",
      });
    } catch {
      /* next */
    }
  }
  return null;
}

/** Open Library Search — cobre edições que a API bibkeys às vezes perde */
async function srcOpenLibrarySearch(isbn13: string) {
  try {
    const raw = await httpGet(
      `https://openlibrary.org/search.json?isbn=${isbn13}&limit=1&fields=title,author_name,publisher,first_publish_year,number_of_pages_median,subject,cover_i,language`,
      10000,
    );
    const data = JSON.parse(raw) as {
      docs?: Array<Record<string, unknown>>;
    };
    const doc = data.docs?.[0];
    if (!doc) return null;
    const coverId = doc.cover_i;
    const langs = Array.isArray(doc.language)
      ? (doc.language as string[])
      : [];
    const lang0 = langs[0] || "";
    return nonempty({
      titulo: String(doc.title || ""),
      autor: Array.isArray(doc.author_name)
        ? (doc.author_name as string[]).join(", ")
        : "",
      editora: Array.isArray(doc.publisher)
        ? String((doc.publisher as string[])[0] || "")
        : "",
      ano: String(doc.first_publish_year || ""),
      paginas: Number(doc.number_of_pages_median) || null,
      genero: Array.isArray(doc.subject)
        ? (doc.subject as string[]).slice(0, 3).join(", ")
        : "",
      idioma: LANG_MAP[lang0] || "",
      capa: coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
        : `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`,
      _src: "Open Library Search",
    });
  } catch {
    return null;
  }
}

async function srcOpenLibrary(isbn13: string) {
  try {
    const raw = await httpGet(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`,
      10000,
    );
    const olRaw = JSON.parse(raw) as Record<
      string,
      {
        title?: string;
        authors?: Array<{ name?: string }>;
        publishers?: Array<{ name?: string }>;
        publish_date?: string;
        excerpts?: Array<{ text?: string }>;
        cover?: { large?: string; medium?: string };
        number_of_pages?: number;
      }
    >;
    const b = olRaw[`ISBN:${isbn13}`];
    if (!b) return null;
    const capa =
      b.cover?.large ||
      b.cover?.medium ||
      `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`;
    return nonempty({
      titulo: b.title || "",
      autor: (b.authors || []).map((a) => a.name || "").join(", "),
      editora: (b.publishers || []).map((p) => p.name || "").join(", "),
      ano: (b.publish_date || "").match(/\d{4}/)?.[0] || "",
      sinopse: b.excerpts?.[0]?.text || "",
      capa,
      paginas: b.number_of_pages || null,
      _src: "Open Library",
    });
  } catch {
    return null;
  }
}

async function srcSkoob(isbn13: string) {
  try {
    let html = await httpGet(
      `https://www.skoob.com.br/livro/new:${isbn13}`,
      10000,
    );
    if (html.length < 2000 || /não encontrado/i.test(html)) {
      const search = await httpGet(
        `https://www.skoob.com.br/busca/?tipo=livro&q=${isbn13}`,
        10000,
      );
      const m = search.match(
        /href="(https:\/\/www\.skoob\.com\.br\/livro\/\d+[^"]*?)"/i,
      );
      if (m?.[1]) html = await httpGet(m[1], 8000);
      else html = search;
    }
    if (!html) return null;

    let d = parseJsonLD(jsonLD(html));
    if (!d.titulo) {
      const og = openGraph(html);
      if (og.title) {
        d = {
          titulo: og.title,
          sinopse: og.description || "",
          capa: og.image || "",
        };
      }
    }
    if (!d.autor) {
      const m =
        html.match(/class="sidebar-author[^"]*"[^>]*>\s*([^<]+)/i) ||
        html.match(/itemprop="author"[^>]*>\s*([^<]+)/i);
      if (m) d.autor = m[1].trim();
    }
    if (!d.editora) {
      const m = html.match(
        /(?:Editora|Publicado por)[^:]*:\s*<[^>]+>\s*([^<]+)/i,
      );
      if (m) d.editora = m[1].trim();
    }
    if (!d.paginas) {
      const m = html.match(/(\d+)\s*p(?:á|a)ginas/i);
      if (m) d.paginas = parseInt(m[1], 10);
    }
    if (!d.ano) {
      const m = html.match(/(?:Ano|Publicação)[^:]*:\s*<[^>]+>\s*(\d{4})/i);
      if (m) d.ano = m[1];
    }
    if (!Object.keys(d).length) return null;
    d._src = "Skoob";
    return nonempty(d);
  } catch {
    return null;
  }
}

async function srcEstanteVirtual(isbn13: string) {
  try {
    const html = await httpGet(
      `https://www.estantevirtual.com.br/busca?q=${isbn13}`,
      10000,
    );
    if (!html) return null;
    let d = parseJsonLD(jsonLD(html));
    if (!d.titulo) {
      const og = openGraph(html);
      if (og.title) {
        d = {
          titulo: og.title,
          sinopse: og.description || "",
          capa: og.image || "",
        };
      }
    }
    if (!d.autor) {
      const m = html.match(
        /<[^>]+class="[^"]*author[^"]*"[^>]*>\s*([^<]+)/i,
      );
      if (m) d.autor = m[1].replace(/<[^>]+>/g, "").trim();
    }
    if (!d.editora) {
      const m = html.match(/(?:Editora)[^:]*:?\s*<[^>]*>\s*([^<]+)/i);
      if (m) d.editora = m[1].trim();
    }
    if (!Object.keys(d).length) return null;
    d._src = "Estante Virtual";
    return nonempty(d);
  } catch {
    return null;
  }
}

async function srcAmazon(isbn13: string) {
  try {
    const searchHtml = await httpGet(
      `https://www.amazon.com.br/s?k=${isbn13}&i=stripbooks`,
      10000,
    );
    if (!searchHtml) return null;

    let productPath = "";
    const m = searchHtml.match(/href="(\/[^"]+\/dp\/[A-Z0-9]{10}\/[^"]*?)"/i);
    if (m?.[1]) {
      productPath = m[1];
    } else {
      const m2 = searchHtml.match(/\/dp\/([A-Z0-9]{10})/i);
      if (!m2?.[1]) return null;
      productPath = `/dp/${m2[1]}`;
    }

    const productHtml = await httpGet(
      `https://www.amazon.com.br${productPath}`,
      10000,
    );
    if (!productHtml) return null;

    let d = parseJsonLD(jsonLD(productHtml));
    if (!d.titulo) {
      const og = openGraph(productHtml);
      if (og.title) {
        d = { titulo: og.title, capa: og.image || "" };
      }
    }
    if (!d.autor) {
      const am = productHtml.match(
        /id="bylineInfo"[^>]*>[\s\S]*?class="author"[^>]*>[\s\S]*?<a[^>]*>([^<]+)/i,
      );
      if (am) d.autor = am[1].trim();
    }
    if (!d.editora) {
      const em = productHtml.match(/Editora[^:]*:[\s\S]*?<span[^>]*>([^<]+)/i);
      if (em) d.editora = em[1].trim();
    }
    if (!d.paginas) {
      const pm = productHtml.match(/(\d+)\s*p(?:á|a)ginas/i);
      if (pm) d.paginas = parseInt(pm[1], 10);
    }
    if (!d.ano) {
      const ym = productHtml.match(
        /\d{1,2}\s+de\s+\w+\s+de\s+(\d{4})/i,
      );
      if (ym) d.ano = ym[1];
    }
    const hi = productHtml.match(/"hiRes"\s*:\s*"([^"]+)"/i);
    const lg = productHtml.match(/"large"\s*:\s*"([^"]+)"/i);
    if (hi?.[1]) d.capa = hi[1];
    else if (lg?.[1]) d.capa = lg[1];

    if (!Object.keys(d).length) return null;
    d._src = "Amazon.com.br";
    return nonempty(d);
  } catch {
    return null;
  }
}

function mergeAll(sources: PartialBook[]) {
  if (!sources.length) return null;

  const longest = (...vals: Array<string | undefined>) =>
    vals
      .filter((v): v is string => !!v && v.trim().length > 0)
      .reduce((a, b) => (b.length > a.length ? b : a), "");

  const pickNum = (...vals: Array<number | null | undefined>) => {
    for (const v of vals) if (typeof v === "number" && v > 0) return v;
    return null;
  };
  const pickStr = (...vals: Array<string | undefined>) => {
    for (const v of vals) if (v && v.trim()) return v.trim();
    return "";
  };
  const col = (field: keyof PartialBook) =>
    sources.map((s) => s[field] as string | number | null | undefined);

  return {
    titulo: longest(...(col("titulo") as string[])),
    autor: longest(...(col("autor") as string[])),
    editora: longest(...(col("editora") as string[])),
    ano: pickStr(...(col("ano") as string[])),
    sinopse: longest(...(col("sinopse") as string[])),
    capa: pickStr(...(col("capa") as string[])),
    paginas: pickNum(...(col("paginas") as Array<number | null | undefined>)),
    genero: longest(...(col("genero") as string[])),
    idioma: pickStr(...(col("idioma") as string[])),
    fontes: sources.map((s) => s._src).filter(Boolean) as string[],
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("isbn") || "";
  const isbn = normISBN(raw);
  if (isbn.length < 10) {
    return NextResponse.json({ erro: "ISBN inválido" }, { status: 400 });
  }
  const isbn13 = isbn.length === 13 ? isbn : normISBN(isbn);
  const isbn10 = toISBN10(isbn13);

  const found: PartialBook[] = [];

  const results = await Promise.allSettled([
    srcGoogleBooks(isbn13, isbn10),
    srcOpenLibrary(isbn13),
    srcOpenLibrarySearch(isbn13),
    srcSkoob(isbn13),
    srcEstanteVirtual(isbn13),
    srcAmazon(isbn13),
  ]);

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) found.push(r.value);
  }

  const merged = mergeAll(found);
  return NextResponse.json({
    encontrado: found.length > 0,
    total_fontes: found.length,
    titulo: merged?.titulo || "",
    autor: merged?.autor || "",
    editora: merged?.editora || "",
    ano: merged?.ano || "",
    sinopse: merged?.sinopse || "",
    capa: merged?.capa || "",
    genero: merged?.genero || "",
    idioma: merged?.idioma || "",
    paginas: merged?.paginas ?? null,
    fontes: merged?.fontes || [],
  });
}
