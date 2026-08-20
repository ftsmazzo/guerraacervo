"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BookCapture, type CaptureMode } from "@/components/book-capture";
import { PhoneQrModal } from "@/components/phone-qr-modal";
import { usePocketMode } from "@/hooks/use-pocket-mode";
import { createBook, updateBook } from "@/lib/books/actions";
import {
  cropDataUrlToCover,
  cropWithFallback,
} from "@/lib/isbn/cover-crop-client";
import {
  fallbackBookBBox,
  isDataCoverUrl,
  isHttpCoverUrl,
  type CoverBBox,
} from "@/lib/isbn/cover-crop";
import { mergeData } from "@/lib/isbn/merge";
import {
  isPlausibleCoverUrl,
  looksLikeEnglish,
  looksLikeIsbnQuery,
  normISBN,
} from "@/lib/isbn/normalize";
import { isPoorSynopsis, synopsisQuality } from "@/lib/isbn/quality-client";
import { enrichBookTags } from "@/lib/isbn/tags-pt";
import {
  fetchGoogle,
  fetchHathiTrust,
  fetchMercadoLivre,
  fetchOpenLibrary,
  fetchOpenLibrarySearch,
  fetchPhpScraper,
} from "@/lib/isbn/sources-client";

type FormSnapshot = {
  title: string;
  author: string;
  publisher: string;
  year: string;
  synopsis: string;
  genre: string;
  language: string;
  pages: string;
  weight: string;
  coverType: string;
  coverUrl: string;
  tagsCount: number;
};

/** Reduz foto para data-URL usável como capa no formulário */
async function fileToCoverDataUrl(file: File, maxSide = 640): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Imagem inválida"));
      el.src = raw;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (raw.length > 700_000) {
        throw new Error("Foto muito grande; use uma imagem menor ou a capa do catálogo.");
      }
      return raw;
    }
    ctx.drawImage(img, 0, 0, w, h);
    let quality = 0.72;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > 700_000 && quality > 0.4) {
      quality -= 0.1;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    if (out.length > 900_000) {
      throw new Error("Foto muito grande após compressão; use a capa do catálogo.");
    }
    return out;
  } catch (e) {
    if (e instanceof Error && /muito grande|inválida/i.test(e.message)) throw e;
    if (raw.length > 700_000) {
      throw new Error("Foto muito grande; use uma imagem menor ou a capa do catálogo.");
    }
    return raw;
  }
}

const MAX_COVER_URL_CHARS = 900_000;

const TAG_COLORS = [
  "#e67e22",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#d97706",
  "#be185d",
];

function tagColor(t: string) {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) % TAG_COLORS.length;
  return TAG_COLORS[h];
}

export type BookFormInitial = {
  id?: string;
  isbn?: string | null;
  title?: string;
  author?: string | null;
  publisher?: string | null;
  year?: number | null;
  synopsis?: string | null;
  pages?: number | null;
  coverUrl?: string | null;
  genre?: string | null;
  language?: string | null;
  weightGrams?: number | null;
  condition?: string;
  coverType?: string;
  purchasePrice?: string | null;
  salePrice?: string;
  stock?: number;
  reserved?: number;
  available?: number;
  location?: string | null;
  tagsList?: string[];
  createdAt?: string;
  updatedAt?: string;
};

type SrcState = "idle" | "searching" | "found" | "notfound";

export function BookForm({
  initial,
  personal = false,
  library = false,
  copies = [],
}: {
  initial?: BookFormInitial;
  personal?: boolean;
  library?: boolean;
  copies?: Array<{
    id: string;
    barcode: string;
    status: string;
    location: string | null;
  }>;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const pocket = usePocketMode();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pocketSavedTitle, setPocketSavedTitle] = useState<string | null>(null);
  const [isbnBusca, setIsbnBusca] = useState(initial?.isbn || "");
  const [src, setSrc] = useState<Record<string, SrcState>>({});
  const [isbnMsg, setIsbnMsg] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("barcode");
  const [phoneQrOpen, setPhoneQrOpen] = useState(false);
  const pcPhotoRef = useRef<HTMLInputElement>(null);
  const pocketAutoCapture = useRef(false);

  const [isbn, setIsbn] = useState(initial?.isbn || "");
  const [location, setLocation] = useState(initial?.location || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [author, setAuthor] = useState(initial?.author || "");
  const [publisher, setPublisher] = useState(initial?.publisher || "");
  const [year, setYear] = useState(initial?.year?.toString() || "");
  const [genre, setGenre] = useState(initial?.genre || "");
  const [language, setLanguage] = useState(initial?.language || "Português");
  const [synopsis, setSynopsis] = useState(initial?.synopsis || "");
  const [purchasePrice, setPurchasePrice] = useState(
    initial?.purchasePrice || "",
  );
  const [salePrice, setSalePrice] = useState(initial?.salePrice || "");
  const [stock, setStock] = useState(String(initial?.stock ?? 1));
  const [weight, setWeight] = useState(initial?.weightGrams?.toString() || "");
  const [pages, setPages] = useState(initial?.pages?.toString() || "");
  const [condition, setCondition] = useState(initial?.condition || "");
  const [coverType, setCoverType] = useState(initial?.coverType || "Brochura");
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl || "");
  const [photoRaw, setPhotoRaw] = useState("");
  const [coverKind, setCoverKind] = useState<"web" | "photo" | "">(
    initial?.coverUrl
      ? isHttpCoverUrl(initial.coverUrl)
        ? "web"
        : isDataCoverUrl(initial.coverUrl)
          ? "photo"
          : ""
      : "",
  );
  const [tagsSet, setTagsSet] = useState<Set<string>>(
    () => new Set(initial?.tagsList || []),
  );
  const [tagInput, setTagInput] = useState("");
  const [tagSugest, setTagSugest] = useState<string[]>([]);
  const [aiQuery, setAiQuery] = useState("");

  const tags = useMemo(() => [...tagsSet], [tagsSet]);
  const yearMax = new Date().getFullYear();

  function pickWebCover(url: string | null | undefined): string {
    const u = (url || "").trim();
    if (
      isHttpCoverUrl(u) &&
      isPlausibleCoverUrl(u) &&
      !u.includes("covers.openlibrary.org/b/isbn/")
    ) {
      return u;
    }
    return "";
  }

  function applyCover(url: string, kind: "web" | "photo") {
    setCoverUrl(url);
    setCoverKind(kind);
  }

  async function cropPhotoForCover(raw: string): Promise<string> {
    try {
      const res = await fetch("/api/covers/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: raw }),
      });
      const d = (await res.json()) as { bbox?: CoverBBox };
      const bbox = d.bbox || fallbackBookBBox();
      return await cropDataUrlToCover(raw, bbox);
    } catch {
      return cropWithFallback(raw);
    }
  }

  async function resolveFinalCover(opts: {
    web?: string;
    photo?: string;
  }): Promise<{ url: string; kind: "web" | "photo" | "" }> {
    const web = pickWebCover(opts.web);
    if (web) return { url: web, kind: "web" };
    const photo = (opts.photo || "").trim();
    if (photo.startsWith("data:image/")) {
      const cropped = await cropPhotoForCover(photo);
      return { url: cropped, kind: "photo" };
    }
    return { url: "", kind: "" };
  }

  function setSource(id: string, state: SrcState) {
    setSrc((s) => ({ ...s, [id]: state }));
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, " ").substring(0, 50);
    if (t.length >= 2) {
      setTagsSet((prev) => new Set(prev).add(t));
    }
  }

  function remTag(t: string) {
    setTagsSet((prev) => {
      const n = new Set(prev);
      n.delete(t);
      return n;
    });
  }

  useEffect(() => {
    const q = tagInput.trim();
    if (q.length < 2) {
      setTagSugest([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tags?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = (await res.json()) as string[];
      setTagSugest(data.filter((s) => !tagsSet.has(s)));
    }, 250);
    return () => clearTimeout(t);
  }, [tagInput, tagsSet]);

  async function buscarISBN(
    code?: string,
    opts?: {
      soft?: boolean;
      /** enrich = só completa lacunas; não sobrescreve IA/foto */
      mode?: "replace" | "enrich";
      base?: FormSnapshot;
      keepCover?: string;
    },
  ): Promise<{ ok: boolean; capa?: string }> {
    const raw = (code ?? isbnBusca).trim();
    if (!raw) return { ok: false };

    // Título digitado no campo ISBN → busca por IA (ex.: "48 leis do poder")
    if (!looksLikeIsbnQuery(raw)) {
      setAiQuery(raw);
      setIsbnMsg(`Buscando por título: “${raw}”…`);
      const res = await fetch("/api/isbn/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: raw, webSearch: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        setIsbnMsg(d.error || "Falha na busca por título");
        return { ok: false };
      }
      await applyAiResult(d);
      return { ok: true };
    }

    const isbnN = normISBN(raw);
    setIsbnBusca(isbnN);
    setShowProgress(true);
    if (!opts?.soft) setIsbnMsg(null);
    const ids = ["google", "openlib", "hathi", "ml", "olsearch", "php"] as const;
    ids.forEach((id) => setSource(id, "searching"));

    const tasks = [
      fetchGoogle(isbnN).then((r) => {
        setSource("google", r ? "found" : "notfound");
        return r;
      }),
      fetchOpenLibrary(isbnN).then((r) => {
        setSource("openlib", r ? "found" : "notfound");
        return r;
      }),
      fetchHathiTrust(isbnN).then((r) => {
        setSource("hathi", r ? "found" : "notfound");
        return r;
      }),
      fetchMercadoLivre(isbnN).then((r) => {
        setSource("ml", r ? "found" : "notfound");
        return r;
      }),
      fetchOpenLibrarySearch(isbnN).then((r) => {
        setSource("olsearch", r ? "found" : "notfound");
        return r;
      }),
      fetchPhpScraper(isbnN).then((r) => {
        setSource("php", r ? "found" : "notfound");
        return r;
      }),
    ];

    const results = await Promise.all(tasks);
    const merged = mergeData(results);
    if (!merged?.titulo) {
      if (!opts?.soft) {
        setIsbnMsg("Nenhuma fonte retornou dados para este ISBN.");
      }
      return { ok: false };
    }

    const enrich = opts?.mode === "enrich";
    const base = opts?.base;
    const keepCover = opts?.keepCover || "";
    const webFromMerge = pickWebCover(merged.capa);
    const keepIsPhoto = isDataCoverUrl(keepCover);
    const keepIsWeb = pickWebCover(keepCover);

    setIsbn(isbnN);

    if (enrich && base) {
      // Completa só o que a IA não trouxe; nunca troca PT por inglês pobre
      if (!base.title.trim() && merged.titulo) setTitle(merged.titulo);
      if (!base.author.trim() && merged.autor) setAuthor(merged.autor);
      if (!base.publisher.trim() && merged.editora) setPublisher(merged.editora);
      if (!base.year.trim() && merged.ano) setYear(merged.ano);

      // Sinopse: troca se a atual for pobre e a do catálogo for melhor (PT)
      if (
        merged.sinopse &&
        !looksLikeEnglish(merged.sinopse) &&
        (isPoorSynopsis(base.synopsis) ||
          synopsisQuality(merged.sinopse) > synopsisQuality(base.synopsis) + 8)
      ) {
        setSynopsis(merged.sinopse);
      }

      if (
        (!base.genre.trim() || looksLikeEnglish(base.genre)) &&
        merged.genero &&
        !looksLikeEnglish(merged.genero)
      ) {
        setGenre(merged.genero);
      }

      if (!base.language.trim() || /english|inglês/i.test(base.language)) {
        if (merged.idioma && /portug/i.test(merged.idioma)) {
          setLanguage(merged.idioma);
        } else if (!base.language.trim() && merged.idioma) {
          setLanguage(merged.idioma);
        }
      }

      if (!base.pages.trim() && merged.paginas) setPages(String(merged.paginas));
      if (!base.weight.trim() && merged.peso) setWeight(String(merged.peso));
      if (merged.tipoCapa) setCoverType(merged.tipoCapa);

      // Capa: web/catálogo vence; foto só se não houver HTTP
      const chosenWeb = webFromMerge || keepIsWeb;
      if (chosenWeb) {
        applyCover(chosenWeb, "web");
      } else if (keepIsPhoto) {
        // mantém foto já resolvida no applyAiResult
        applyCover(keepCover, "photo");
      }

      // Tags: sempre mescla catálogo + deriva da ficha
      enrichBookTags(
        [merged.tags],
        {
          genero: genre || merged.genero,
          idioma: language || merged.idioma,
          colecao: "",
          tipoCapa: coverType || merged.tipoCapa || "",
          ano: year || merged.ano,
          titulo: title || merged.titulo,
        },
      ).forEach(addTag);

      setIsbnMsg(
        `ISBN ${isbnN} · enriquecido com: ${merged.fontes.join(" + ") || "fontes"} (sem sobrescrever a IA)`,
      );
      return {
        ok: true,
        capa: chosenWeb || (keepIsPhoto ? keepCover : undefined),
      };
    }

    // Modo replace (busca ISBN manual)
    setTitle(merged.titulo);
    if (merged.autor) setAuthor(merged.autor);
    if (merged.editora) setPublisher(merged.editora);
    if (merged.ano) setYear(merged.ano);
    if (merged.sinopse && !looksLikeEnglish(merged.sinopse)) {
      setSynopsis(merged.sinopse);
    } else if (merged.sinopse && !synopsis) {
      setSynopsis(merged.sinopse);
    }
    if (merged.genero) setGenre(merged.genero);
    if (merged.idioma) setLanguage(merged.idioma);
    const capaOk = webFromMerge;
    if (capaOk) applyCover(capaOk, "web");
    else if (opts?.keepCover && isHttpCoverUrl(opts.keepCover)) {
      applyCover(opts.keepCover, "web");
    } else if (opts?.keepCover && isDataCoverUrl(opts.keepCover)) {
      applyCover(opts.keepCover, "photo");
    }
    if (merged.paginas) setPages(String(merged.paginas));
    if (merged.peso && !weight) setWeight(String(merged.peso));
    if (merged.tipoCapa) setCoverType(merged.tipoCapa);
    enrichBookTags(
      [merged.tags],
      {
        genero: merged.genero,
        idioma: merged.idioma,
        tipoCapa: merged.tipoCapa,
        ano: merged.ano,
        titulo: merged.titulo,
      },
    ).forEach(addTag);
    setIsbnMsg(
      `Dados mesclados de: ${merged.fontes.join(" + ") || "fontes disponíveis"}`,
    );
    return { ok: true, capa: capaOk || undefined };
  }

  async function buscarIATexto(queryOverride?: string) {
    const q = (queryOverride ?? aiQuery).trim();
    if (!q) return;
    setAiQuery(q);
    setIsbnMsg("Consultando IA + web…");
    const res = await fetch("/api/isbn/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, webSearch: true }),
    });
    const d = await res.json();
    if (!res.ok) {
      setIsbnMsg(d.error || "Falha na IA");
      return;
    }
    await applyAiResult(d);
  }

  async function buscarIAFoto(fileOrDataUrl: File | string) {
    setIsbnMsg("Analisando foto da capa (IA + web)…");
    let photoDataUrl: string;
    try {
      photoDataUrl =
        typeof fileOrDataUrl === "string"
          ? fileOrDataUrl
          : await fileToCoverDataUrl(fileOrDataUrl);
    } catch (e) {
      setIsbnMsg(e instanceof Error ? e.message : "Falha ao processar foto");
      return;
    }
    setPhotoRaw(photoDataUrl);
    const res = await fetch("/api/isbn/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: photoDataUrl, webSearch: true }),
    });
    const d = await res.json();
    if (!res.ok) {
      setIsbnMsg(d.error || "Falha na IA");
      const cropped = await cropPhotoForCover(photoDataUrl);
      applyCover(cropped, "photo");
      return;
    }
    await applyAiResult(d, { uploadedCover: photoDataUrl });
  }

  async function applyAiResult(
    d: Record<string, unknown>,
    opts?: { uploadedCover?: string },
  ) {
    const photo = opts?.uploadedCover || "";
    if (photo) setPhotoRaw(photo);

    if (d.titulo) setTitle(String(d.titulo));
    if (d.autor) setAuthor(String(d.autor));
    if (d.editora) setPublisher(String(d.editora));
    if (d.ano) setYear(String(d.ano));
    if (d.sinopse) setSynopsis(String(d.sinopse));
    if (d.genero) setGenre(String(d.genero));
    if (d.idioma) setLanguage(String(d.idioma));
    else setLanguage("Português");
    if (d.paginas) setPages(String(d.paginas));
    if (d.tipoCapa === "Brochura" || d.tipoCapa === "Capa Dura") {
      setCoverType(d.tipoCapa);
    }
    if (typeof d.peso === "number" && d.peso > 0) {
      setWeight(String(d.peso));
    }

    const aiTags = enrichBookTags(
      [Array.isArray(d.tags) ? d.tags.map(String) : []],
      {
        genero: String(d.genero || ""),
        idioma: String(d.idioma || "Português"),
        colecao: typeof d.colecao === "string" ? d.colecao : "",
        tipoCapa:
          d.tipoCapa === "Brochura" || d.tipoCapa === "Capa Dura"
            ? d.tipoCapa
            : "",
        ano: String(d.ano || ""),
        titulo: String(d.titulo || ""),
      },
    );
    aiTags.forEach(addTag);

    const catalogCover = pickWebCover(
      typeof d.capa === "string" ? d.capa : "",
    );

    // Capa: web primeiro; senão foto recortada
    const initialCover = await resolveFinalCover({
      web: catalogCover,
      photo,
    });
    if (initialCover.url) {
      applyCover(initialCover.url, initialCover.kind === "web" ? "web" : "photo");
    }

    const isbnFound =
      typeof d.isbn === "string" && d.isbn.replace(/\D/g, "").length >= 10
        ? String(d.isbn)
        : "";
    const conf =
      typeof d.confianca === "number"
        ? ` · confiança ${Math.round(d.confianca * 100)}%`
        : "";
    const src = String(d._src || d.model || "IA");
    const avisos = Array.isArray(d.avisos)
      ? d.avisos.map(String).filter(Boolean)
      : [];
    const extra = avisos.length ? ` · ${avisos.join(" ")}` : "";

    const snapshot: FormSnapshot = {
      title: String(d.titulo || ""),
      author: String(d.autor || ""),
      publisher: String(d.editora || ""),
      year: String(d.ano || ""),
      synopsis: String(d.sinopse || ""),
      genre: String(d.genero || ""),
      language: String(d.idioma || "Português"),
      pages: d.paginas ? String(d.paginas) : "",
      weight: typeof d.peso === "number" && d.peso > 0 ? String(d.peso) : "",
      coverType:
        d.tipoCapa === "Brochura" || d.tipoCapa === "Capa Dura"
          ? d.tipoCapa
          : "Brochura",
      coverUrl: initialCover.url || catalogCover || "",
      tagsCount: aiTags.length,
    };

    if (isbnFound && d.isbnConfirmado === true) {
      setIsbnBusca(isbnFound);
      setIsbnMsg(`${src}${conf} — buscando capa/ficha nas fontes…`);
      const r = await buscarISBN(isbnFound, {
        soft: true,
        mode: "enrich",
        base: snapshot,
        // Preferir web já encontrada; foto só como fallback no enrich
        keepCover: catalogCover || initialCover.url || undefined,
      });
      if (r.ok) {
        const enrichWeb = pickWebCover(r.capa);
        if (enrichWeb) {
          applyCover(enrichWeb, "web");
          setIsbnMsg(
            `${src}${conf} · capa da web · ISBN ${isbnFound}${extra}`,
          );
        } else if (initialCover.kind === "photo") {
          setIsbnMsg(
            `${src}${conf} · foto ajustada (sem capa online) · ISBN ${isbnFound}${extra}`,
          );
        } else {
          setIsbnMsg(
            `${src}${conf} · ficha da IA preservada · ISBN ${isbnFound}${extra}`,
          );
        }
        return;
      }
      setIsbn(isbnFound);
      setIsbnMsg(
        initialCover.kind === "web"
          ? `${src}${conf} · capa da web · ISBN ${isbnFound}${extra}`
          : `${src}${conf} · foto ajustada · ISBN ${isbnFound}${extra}`,
      );
      return;
    }

    setIsbn("");
    if (!isbnFound) setIsbnBusca("");
    setIsbnMsg(
      initialCover.kind === "web"
        ? `Preenchido por ${src}${conf} · capa da web${extra}`
        : initialCover.kind === "photo"
          ? `Preenchido por ${src}${conf} · foto ajustada (sem capa online)${extra}`
          : `Preenchido por ${src}${conf}${extra}`,
    );
  }

  async function refetchWebCover() {
    const code = (isbn || isbnBusca).trim();
    if (looksLikeIsbnQuery(code)) {
      setIsbnMsg("Buscando capa na web pelo ISBN…");
      const r = await buscarISBN(code, {
        soft: true,
        mode: "replace",
        keepCover: coverUrl || undefined,
      });
      if (r.capa && pickWebCover(r.capa)) {
        applyCover(pickWebCover(r.capa), "web");
        setIsbnMsg("Capa da web atualizada.");
      } else {
        setIsbnMsg("Não achei capa melhor na web.");
      }
      return;
    }
    const q = [title, author].filter(Boolean).join(" ").trim();
    if (q.length < 3) {
      setIsbnMsg("Informe título/autor ou ISBN para buscar capa.");
      return;
    }
    setIsbnMsg("Buscando capa na web…");
    const res = await fetch("/api/isbn/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, webSearch: true }),
    });
    const d = await res.json();
    if (!res.ok) {
      setIsbnMsg(d.error || "Falha ao buscar capa");
      return;
    }
    const web = pickWebCover(typeof d.capa === "string" ? d.capa : "");
    if (web) {
      applyCover(web, "web");
      setIsbnMsg("Capa da web atualizada.");
    } else {
      setIsbnMsg("Não achei capa melhor na web.");
    }
  }

  function useMyPhoto() {
    if (!photoRaw) {
      setIsbnMsg("Nenhuma foto de capa disponível nesta sessão.");
      return;
    }
    void (async () => {
      const cropped = await cropPhotoForCover(photoRaw);
      applyCover(cropped, "photo");
      setIsbnMsg("Usando sua foto (ajustada).");
    })();
  }

  function openCapture(mode: CaptureMode) {
    setCaptureMode(mode);
    setCaptureOpen(true);
  }

  function openPhoneQr() {
    setPhoneQrOpen(true);
  }

  function resetForNextBook(opts?: { keepPhoneQr?: boolean }) {
    const keepPhoneQr = Boolean(opts?.keepPhoneQr) || phoneQrOpen;
    setPocketSavedTitle(null);
    setError(null);
    setIsbnBusca("");
    setSrc({});
    setIsbnMsg(
      keepPhoneQr
        ? "Pronto para o próximo. No celular, fotografe ou leia o ISBN — o mesmo QR continua válido."
        : null,
    );
    setShowProgress(false);
    setIsbn("");
    setLocation("");
    setTitle("");
    setAuthor("");
    setPublisher("");
    setYear("");
    setGenre("");
    setLanguage("Português");
    setSynopsis("");
    setPurchasePrice("");
    setSalePrice("");
    setStock("1");
    setWeight("");
    setPages("");
    setCondition("");
    setCoverType("Brochura");
    setCoverUrl("");
    setPhotoRaw("");
    setCoverKind("");
    setTagsSet(new Set());
    setTagInput("");
    setTagSugest([]);
    setAiQuery("");
    if (keepPhoneQr) setPhoneQrOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Câmera do notebook só no modo bolso; com QR o celular é a fonte
    if (pocket && !keepPhoneQr) {
      setTimeout(() => openCapture("barcode"), 350);
    }
  }

  useEffect(() => {
    if (!pocket || isEdit || pocketAutoCapture.current || pocketSavedTitle) {
      return;
    }
    pocketAutoCapture.current = true;
    const t = setTimeout(() => openCapture("barcode"), 400);
    return () => clearTimeout(t);
  }, [pocket, isEdit, pocketSavedTitle]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const capa = (coverUrl || "").trim() || null;
        if (capa && capa.startsWith("data:image/") && capa.length > MAX_COVER_URL_CHARS) {
          setError(
            "Capa em foto ficou grande demais para salvar. Remova a foto ou use a URL de capa do catálogo.",
          );
          return;
        }
        const payload = {
          isbn: isbn || null,
          titulo: title,
          autor: author || null,
          editora: publisher || null,
          ano: year ? Number(year) : null,
          sinopse: synopsis || null,
          paginas: pages ? Number(pages) : null,
          capaUrl: capa,
          genero: genre || null,
          idioma: language || "Português",
          peso: Number(weight) || 300,
          estado: (condition || "Bom") as "Novo" | "Ótimo" | "Bom" | "Regular",
          tipoCapa: (coverType || "Brochura") as "Brochura" | "Capa Dura",
          precoCompra: personal
            ? null
            : purchasePrice
              ? Number(purchasePrice)
              : null,
          precoVenda: personal || library ? 0 : Number(salePrice),
          estoque: personal ? 1 : Number(stock),
          localizacao: personal ? null : location || null,
          tags,
        };
        const result = initial?.id
          ? await updateBook(initial.id, payload)
          : await createBook(payload);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Novo livro: permanece na tela. Com QR aberto, o celular segue
        // enviando fotos no mesmo código (sem entrar e sair).
        if (!isEdit) {
          if (pocket) {
            setPocketSavedTitle(title || "Livro");
            return;
          }
          const keepQr = phoneQrOpen;
          const saved = title || "Livro";
          resetForNextBook({ keepPhoneQr: keepQr });
          setIsbnMsg(
            keepQr
              ? `“${saved}” salvo. No celular, fotografe o próximo — o mesmo QR continua válido.`
              : `“${saved}” salvo. Pronto para cadastrar o próximo.`,
          );
          return;
        }
        router.push("/painel/livros");
        router.refresh();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Falha ao salvar o livro.";
        setError(
          /Body exceeded|too large|413|payload/i.test(msg)
            ? "Dados muito grandes para enviar (provavelmente a capa). Use URL de capa ou foto menor."
            : msg,
        );
      }
    });
  }

  const srcLabel: Record<string, string> = {
    google: "Google Books",
    openlib: "Open Library",
    hathi: "HathiTrust",
    ml: "Mercado Livre 🇧🇷",
    olsearch: "OL Search",
    php: "🇧🇷 BR Scraper",
  };

  return (
    <div className={`livros-page${pocket ? " is-pocket" : ""}`}>
      {pocketSavedTitle ? (
        <div className="pocket-saved">
          <div className="pocket-saved-check" aria-hidden>
            ✓
          </div>
          <h2>Na prateleira</h2>
          <p>
            <strong>{pocketSavedTitle}</strong> foi cadastrado.
          </p>
          <div className="pocket-saved-actions">
            <button
              type="button"
              className="btn-accent pocket-cta"
              onClick={() => resetForNextBook()}
            >
              Cadastrar outro
            </button>
            <Link href="/painel/livros" className="btn-outline pocket-cta">
              Ver catálogo
            </Link>
          </div>
        </div>
      ) : null}

      <div className={pocketSavedTitle ? "hidden" : undefined}>
      <div className="page-header">
        <div>
          <h4>{isEdit ? "Editar Livro" : pocket ? "Cadastrar na prateleira" : "Novo Livro"}</h4>
          <nav className="text-xs text-muted">
            <Link href="/painel/livros">Livros</Link> /{" "}
            {isEdit ? "Editar" : pocket ? "Bolso" : "Novo"}
          </nav>
        </div>
        <Link
          href="/painel/livros"
          className="rounded-md border border-line px-3 py-1.5 text-sm"
        >
          ← Voltar
        </Link>
      </div>

      <div className="card mb-4 isbn-lookup-card">
        <div className="card-body">
          <div className="isbn-lookup-top">
            <div className="isbn-lookup-icon">{pocket ? "📷" : "ISBN"}</div>
            <div className="isbn-lookup-copy">
              <div className="isbn-lookup-title">
                {pocket ? "Identificar com a câmera" : "Identificar o livro"}
              </div>
              <div className="isbn-lookup-sub">
                {pocket
                  ? "Leia o código ou fotografe a capa — tudo neste celular"
                  : "Três caminhos: teclado neste PC, webcam deste PC, ou celular via QR"}
              </div>
            </div>
          </div>

          {pocket ? (
            <div className="pocket-capture">
              <button
                type="button"
                className="pocket-capture-primary"
                onClick={() => openCapture("barcode")}
              >
                Ler código de barras
              </button>
              <div className="pocket-capture-row">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => openCapture("cover")}
                >
                  Foto da capa
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => pcPhotoRef.current?.click()}
                >
                  Galeria
                </button>
              </div>
              <div className="isbn-input-group mt-2">
                <input
                  value={isbnBusca}
                  onChange={(e) => setIsbnBusca(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), void buscarISBN())
                  }
                  className="form-control"
                  placeholder="ISBN ou título…"
                  maxLength={120}
                  inputMode="search"
                />
                <button
                  type="button"
                  className="btn-accent"
                  onClick={() => void buscarISBN()}
                >
                  Buscar
                </button>
              </div>
              <input
                ref={pcPhotoRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="book-capture-file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void buscarIAFoto(f);
                }}
              />
            </div>
          ) : (
          <div className="isbn-worlds">
            <div className="isbn-world">
              <div className="isbn-world-label">1 · Teclado / arquivo</div>
              <div className="isbn-input-group">
                <input
                  value={isbnBusca}
                  onChange={(e) => setIsbnBusca(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), void buscarISBN())
                  }
                  className="form-control"
                  placeholder="ISBN ou título…"
                  maxLength={120}
                />
                <button
                  type="button"
                  className="btn-accent"
                  onClick={() => void buscarISBN()}
                >
                  Buscar
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  title="Carregar foto da capa neste computador"
                  onClick={() => pcPhotoRef.current?.click()}
                >
                  Foto
                </button>
              </div>
              <input
                ref={pcPhotoRef}
                type="file"
                accept="image/*"
                className="book-capture-file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void buscarIAFoto(f);
                }}
              />
            </div>

            <div className="isbn-world">
              <div className="isbn-world-label">2 · Webcam deste PC</div>
              <div className="isbn-world-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => openCapture("barcode")}
                  title="Ler código de barras na webcam"
                >
                  Código
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => openCapture("cover")}
                  title="Fotografar capa na webcam"
                >
                  Capa
                </button>
              </div>
            </div>

            <div className="isbn-world">
              <div className="isbn-world-label">3 · Celular (QR)</div>
              <button
                type="button"
                className="btn-phone"
                onClick={openPhoneQr}
                title="Abrir QR para o celular ler e enviar ao PC"
              >
                Usar celular
              </button>
              <p className="isbn-world-hint">
                O PC fica aberto; o celular só lê e devolve o dado.
              </p>
            </div>
          </div>
          )}

          {showProgress ? (
            <div className="isbn-source-row mb-2 mt-3">
              {Object.keys(srcLabel).map((id) => (
                <span
                  key={id}
                  className={`isbn-src ${src[id] && src[id] !== "idle" ? src[id] : ""}`}
                >
                  {srcLabel[id]}
                </span>
              ))}
            </div>
          ) : null}
          {isbnMsg ? (
            <div className="isbn-msg mt-3">{isbnMsg}</div>
          ) : null}

          <details className="isbn-ai-details mt-3">
            <summary>IA por texto (opcional)</summary>
            <div className="isbn-input-group mt-2">
              <input
                className="form-control"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void buscarIATexto();
                  }
                }}
                placeholder="Ex: 48 leis do poder Robert Greene"
              />
              <button
                type="button"
                className="btn-outline"
                onClick={() => void buscarIATexto()}
              >
                IA
              </button>
            </div>
          </details>
        </div>
      </div>

      <BookCapture
        key={captureOpen ? `cap-${captureMode}` : "cap-closed"}
        open={captureOpen}
        initialMode={captureMode}
        onClose={() => setCaptureOpen(false)}
        onIsbn={(code) => {
          setIsbnBusca(code);
          void buscarISBN(code);
        }}
        onCoverPhoto={(dataUrl) => {
          void buscarIAFoto(dataUrl);
        }}
      />

      {!pocket ? (
        <PhoneQrModal
          open={phoneQrOpen}
          onClose={() => setPhoneQrOpen(false)}
          onIsbn={(code) => {
            setIsbnBusca(code);
            void buscarISBN(code);
          }}
          onCoverPhoto={(dataUrl) => {
            void buscarIAFoto(dataUrl);
          }}
        />
      ) : null}

      <form onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div>
            <div className="card mb-3">
              <div className="card-header">
                {pocket ? "Prateleira — o essencial" : "Dados do Livro"}
              </div>
              <div className="card-body grid gap-3 md:grid-cols-2">
                <div>
                  <label className="form-label">ISBN</label>
                  <input
                    className="form-control font-mono"
                    value={isbn}
                    onChange={(e) => setIsbn(e.target.value)}
                  />
                </div>
                {personal ? null : (
                <div>
                  <label className="form-label">
                    {library ? "Localização" : "Localização no Sebo"}
                  </label>
                  <input
                    className="form-control"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Estante A — Prateleira 3"
                  />
                </div>
                )}
                <div className="md:col-span-2">
                  <label className="form-label">
                    Título <span className="required-star">*</span>
                  </label>
                  <input
                    className="form-control"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Autor(es)</label>
                  <input
                    className="form-control"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </div>
                {!pocket ? (
                <div>
                  <label className="form-label">Editora</label>
                  <input
                    className="form-control"
                    value={publisher}
                    onChange={(e) => setPublisher(e.target.value)}
                  />
                </div>
                ) : null}
                {pocket ? (
                  <details className="pocket-more md:col-span-2">
                    <summary>Mais detalhes (editora, sinopse…)</summary>
                    <div className="mt-3 grid gap-3">
                      <div>
                        <label className="form-label">Editora</label>
                        <input
                          className="form-control"
                          value={publisher}
                          onChange={(e) => setPublisher(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Ano</label>
                        <input
                          type="number"
                          min={1000}
                          max={yearMax}
                          className="form-control"
                          value={year}
                          onChange={(e) => setYear(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Gênero / Categoria</label>
                        <input
                          className="form-control"
                          value={genre}
                          onChange={(e) => setGenre(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Idioma</label>
                        <input
                          className="form-control"
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Sinopse</label>
                        <textarea
                          className="form-control"
                          rows={3}
                          value={synopsis}
                          onChange={(e) => setSynopsis(e.target.value)}
                        />
                      </div>
                    </div>
                  </details>
                ) : (
                  <>
                <div>
                  <label className="form-label">Ano</label>
                  <input
                    type="number"
                    min={1000}
                    max={yearMax}
                    className="form-control"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Gênero / Categoria</label>
                  <input
                    className="form-control"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Idioma</label>
                  <input
                    className="form-control"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="form-label">Sinopse</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                  />
                </div>
                  </>
                )}
              </div>
            </div>

            {pocket ? (
              <details className="card mb-3 pocket-more-card">
                <summary className="card-header" style={{ cursor: "pointer" }}>
                  Tags de pesquisa (opcional)
                </summary>
                <div className="card-body">
                  <div
                    className="mb-2 flex min-h-10 flex-wrap gap-2 rounded border border-line p-2"
                    style={{ background: "#f8fafc" }}
                  >
                    {!tags.length ? (
                      <span className="text-xs italic text-muted">
                        Nenhuma tag — adicione abaixo
                      </span>
                    ) : (
                      tags.map((t) => (
                        <span
                          key={t}
                          className="tag-pill"
                          style={{ background: tagColor(t) }}
                        >
                          {t}
                          <button type="button" onClick={() => remTag(t)}>
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <input
                    className="form-control"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(tagInput);
                        setTagInput("");
                      }
                    }}
                    placeholder="Nova tag…"
                  />
                </div>
              </details>
            ) : (
            <div className="card mb-3">
              <div className="card-header">Tags de Pesquisa</div>
              <div className="card-body">
                <div
                  className="mb-2 flex min-h-10 flex-wrap gap-2 rounded border border-line p-2"
                  style={{ background: "#f8fafc" }}
                >
                  {!tags.length ? (
                    <span className="text-xs italic text-muted">
                      Nenhuma tag — adicione abaixo
                    </span>
                  ) : (
                    tags.map((t) => (
                      <span
                        key={t}
                        className="tag-pill"
                        style={{ background: tagColor(t) }}
                      >
                        {t}
                        <button type="button" onClick={() => remTag(t)}>
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    className="form-control"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        tagInput.split(",").forEach(addTag);
                        setTagInput("");
                      }
                    }}
                    placeholder="Digite e pressione Enter ou vírgula…"
                    maxLength={60}
                  />
                  <button
                    type="button"
                    className="rounded-md border border-line px-3"
                    onClick={() => {
                      tagInput.split(",").forEach(addTag);
                      setTagInput("");
                    }}
                  >
                    +
                  </button>
                </div>
                {tagSugest.length ? (
                  <div className="mt-1 rounded border border-line bg-card">
                    {tagSugest.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-sidebar-hover"
                        onClick={() => {
                          addTag(s);
                          setTagInput("");
                          setTagSugest([]);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="form-text">
                  Ex: infantil, cachorro, aventura — sugestões das fontes entram
                  automaticamente
                </div>
              </div>
            </div>
            )}

            <div className="card">
              <div className="card-header">
                {personal ? "Conservação" : library ? "Exemplares e físico" : "Preços, Estoque e Físico"}
              </div>
              <div className="card-body grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {personal ? null : (
                  <>
                {library ? null : (
                <>
                <div>
                  <label className="form-label">Preço Compra (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">
                    Preço Venda (R$) <span className="required-star">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="form-control"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                  />
                </div>
                </>
                )}
                <div>
                  <label className="form-label">
                    {library ? "Exemplares" : "Estoque"}{" "}
                    <span className="required-star">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    className="form-control"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                  {library ? (
                    <div className="form-text">
                      Quantidade de cópias. Cada uma recebe um código de
                      exemplar para empréstimo.
                    </div>
                  ) : typeof initial?.reserved === "number" &&
                  initial.reserved > 0 ? (
                    <div className="form-text" style={{ color: "#b45309" }}>
                      Reservado em pedidos (Aguardando Pagamento):{" "}
                      <strong>{initial.reserved}</strong>
                      {typeof initial.available === "number"
                        ? ` · disponível agora: ${initial.available}`
                        : null}
                    </div>
                  ) : (
                    <div className="form-text">
                      Estoque físico. Reservas de pedidos em Aguardando
                      Pagamento baixam a disponibilidade sem alterar este
                      número.
                    </div>
                  )}
                  {library && isEdit && copies.length > 0 ? (
                    <div
                      className="form-text"
                      style={{ marginTop: "0.75rem" }}
                    >
                      <strong>Códigos dos exemplares</strong>
                      <ul
                        style={{
                          margin: "0.35rem 0 0",
                          paddingLeft: "1.1rem",
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "0.85rem",
                        }}
                      >
                        {copies.map((c) => (
                          <li key={c.id}>
                            {c.barcode}
                            <span style={{ opacity: 0.7 }}>
                              {" "}
                              ·{" "}
                              {c.status === "available"
                                ? "disponível"
                                : c.status === "on_loan"
                                  ? "emprestado"
                                  : c.status}
                              {c.location ? ` · ${c.location}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p style={{ marginTop: "0.5rem" }}>
                        <Link
                          href={`/painel/livros/${initial!.id}/etiquetas`}
                          className="text-sm"
                          style={{ textDecoration: "underline" }}
                        >
                          Imprimir etiquetas dos exemplares
                        </Link>
                      </p>
                    </div>
                  ) : null}
                </div>
                </>
                )}
                {personal ? null : (
                <div>
                  <label className="form-label">
                    Peso {!pocket ? <span className="required-star">*</span> : null} (g)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required={!pocket}
                    className="form-control"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder={pocket ? "300 se vazio" : undefined}
                  />
                  <div className="form-text">
                    {weight
                      ? `≈ ${(Number(weight) / 1000).toFixed(3)} kg`
                      : ""}
                  </div>
                </div>
                )}
                <div>
                  <label className="form-label">Nº de Páginas</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={pages}
                    onChange={(e) => setPages(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">
                    Estado de Conservação <span className="required-star">*</span>
                  </label>
                  <select
                    className="form-select"
                    required
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {["Novo", "Ótimo", "Bom", "Regular"].map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">
                    Tipo de Capa <span className="required-star">*</span>
                  </label>
                  <select
                    className="form-select"
                    required
                    value={coverType}
                    onChange={(e) => setCoverType(e.target.value)}
                  >
                    {["Brochura", "Capa Dura"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="card sticky top-[70px]">
              <div className="card-header flex items-center justify-between gap-2">
                <span>Capa do Livro</span>
                {coverKind ? (
                  <span
                    className={
                      coverKind === "web"
                        ? "cover-badge web"
                        : "cover-badge photo"
                    }
                  >
                    {coverKind === "web" ? "Web" : "Foto"}
                  </span>
                ) : null}
              </div>
              <div className="card-body text-center">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt="Capa"
                    style={{
                      maxWidth: 160,
                      borderRadius: 8,
                      margin: "0 auto 12px",
                      boxShadow: "0 4px 16px rgba(0,0,0,.18)",
                    }}
                  />
                ) : (
                  <div className="py-8 text-muted">
                    <div className="mb-2 text-3xl opacity-25">🖼️</div>
                    <small>Sem capa ainda</small>
                  </div>
                )}
                <label className="form-label w-full text-start">URL da Capa</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={coverUrl}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCoverUrl(v);
                    setCoverKind(
                      isHttpCoverUrl(v)
                        ? "web"
                        : isDataCoverUrl(v)
                          ? "photo"
                          : "",
                    );
                  }}
                  placeholder="https://… (preferencial) ou foto"
                />
                <div className="form-text text-start">
                  Preferimos capa limpa da web. A foto só entra (recortada) se não
                  houver imagem online.
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  <button
                    type="button"
                    className="btn-outline w-full text-sm"
                    onClick={() => void refetchWebCover()}
                  >
                    Buscar capa na web de novo
                  </button>
                  {photoRaw ? (
                    <button
                      type="button"
                      className="btn-outline w-full text-sm"
                      onClick={useMyPhoto}
                    >
                      Usar minha foto
                    </button>
                  ) : null}
                  {isbn ? (
                    <button
                      type="button"
                      className="btn-outline w-full text-sm"
                      onClick={() => void buscarISBN(isbn)}
                    >
                      Recarregar ficha pelo ISBN
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className={`mt-4 flex gap-2${pocket ? " pocket-submit" : ""}`}>
          <button type="submit" className="btn-accent px-4" disabled={pending}>
            {pending
              ? "Salvando…"
              : isEdit
                ? "Salvar Alterações"
                : pocket
                  ? "Colocar na prateleira"
                  : "Cadastrar Livro"}
          </button>
          <Link
            href="/painel/livros"
            className="rounded-md border border-line px-4 py-2 text-sm"
          >
            Cancelar
          </Link>
        </div>
      </form>
      </div>
    </div>
  );
}
