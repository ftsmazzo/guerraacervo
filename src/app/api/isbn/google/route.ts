import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import {
  emptyLookup,
  LANG_MAP,
  normISBN,
  toISBN10,
  type BookLookupResult,
} from "@/lib/isbn/normalize";
import { processarTags } from "@/lib/isbn/tags-pt";

export const dynamic = "force-dynamic";

function googleBooksKeyQ(): string {
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  return key ? `&key=${encodeURIComponent(key)}` : "";
}

/** Proxy autenticado — não expõe a API key no browser. */
export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const isbnRaw = new URL(request.url).searchParams.get("isbn") || "";
  const isbn = normISBN(isbnRaw.replace(/[^\dXx]/gi, ""));
  if (isbn.length < 10) {
    return NextResponse.json({ error: "ISBN inválido." }, { status: 400 });
  }

  const isbn10 = toISBN10(isbn);
  const queries = [`isbn:${isbn}`, isbn10 ? `isbn:${isbn10}` : null, isbn].filter(
    Boolean,
  ) as string[];
  const keyQ = googleBooksKeyQ();

  for (const q of queries) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1${keyQ}`,
        { cache: "no-store" },
      );
      if (r.status === 429) {
        return NextResponse.json(
          { error: "Cota Google Books excedida." },
          { status: 429 },
        );
      }
      if (!r.ok) continue;
      const d = (await r.json()) as {
        items?: Array<{ volumeInfo?: Record<string, unknown> }>;
      };
      if (!d.items?.length) continue;
      const inf = d.items[0].volumeInfo as Record<string, unknown>;
      const imageLinks = inf.imageLinks as Record<string, string> | undefined;
      let capa = "";
      if (imageLinks) {
        const raw =
          imageLinks.extraLarge ||
          imageLinks.large ||
          imageLinks.medium ||
          imageLinks.thumbnail ||
          "";
        capa = raw
          .replace("http://", "https://")
          .replace("&edge=curl", "")
          .replace("zoom=1", "zoom=3");
      }
      const title = String(inf.title || "");
      const subtitle = String(inf.subtitle || "");
      const book: BookLookupResult = {
        ...emptyLookup("Google Books"),
        titulo: subtitle ? `${title}: ${subtitle}` : title,
        paginas: Number(inf.pageCount) || null,
        autor: Array.isArray(inf.authors)
          ? (inf.authors as string[]).join(", ")
          : "",
        editora: String(inf.publisher || ""),
        ano: String(inf.publishedDate || "").match(/\d{4}/)?.[0] || "",
        sinopse: String(inf.description || ""),
        capa,
        genero: Array.isArray(inf.categories)
          ? (inf.categories as string[]).join(", ")
          : "",
        idioma:
          LANG_MAP[String(inf.language || "")] ||
          String(inf.language || ""),
        tags: processarTags(
          Array.isArray(inf.categories) ? (inf.categories as string[]) : [],
        ),
        _src: "Google Books",
      };
      return NextResponse.json(book);
    } catch {
      /* next */
    }
  }

  return NextResponse.json(null);
}
