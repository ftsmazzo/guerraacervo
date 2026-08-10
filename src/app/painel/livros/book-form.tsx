"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createBook, updateBook } from "@/lib/books/actions";
import { mergeData } from "@/lib/isbn/merge";
import {
  isPlausibleCoverUrl,
  looksLikeEnglish,
  looksLikeIsbnQuery,
  normISBN,
} from "@/lib/isbn/normalize";
import { isPoorSynopsis, synopsisQuality } from "@/lib/isbn/quality-client";
import { processarTags } from "@/lib/isbn/tags-pt";
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
  location?: string | null;
  tagsList?: string[];
  createdAt?: string;
  updatedAt?: string;
};

type SrcState = "idle" | "searching" | "found" | "notfound";

declare global {
  interface Window {
    ZXing?: {
      BrowserMultiFormatReader: new () => {
        listVideoInputDevices: () => Promise<MediaDeviceInfo[]>;
        decodeFromVideoDevice: (
          deviceId: string | null,
          video: HTMLVideoElement,
          cb: (result: { getText: () => string } | undefined, err: unknown) => void,
        ) => Promise<void>;
        reset: () => void;
      };
    };
  }
}

export function BookForm({ initial }: { initial?: BookFormInitial }) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isbnBusca, setIsbnBusca] = useState(initial?.isbn || "");
  const [src, setSrc] = useState<Record<string, SrcState>>({});
  const [isbnMsg, setIsbnMsg] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<{ reset: () => void } | null>(null);

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
  const [tagsSet, setTagsSet] = useState<Set<string>>(
    () => new Set(initial?.tagsList || []),
  );
  const [tagInput, setTagInput] = useState("");
  const [tagSugest, setTagSugest] = useState<string[]>([]);
  const [aiQuery, setAiQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const tags = useMemo(() => [...tagsSet], [tagsSet]);
  const yearMax = new Date().getFullYear();

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
    const preferKeepCover =
      keepCover.startsWith("data:image/") ||
      (keepCover && !merged.capa) ||
      enrich;

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

      // Capa: foto/upload sempre vence; catálogo só se keepCover vazio e capa plausível
      if (preferKeepCover && keepCover) {
        setCoverUrl(keepCover);
      } else if (
        merged.capa &&
        isPlausibleCoverUrl(merged.capa) &&
        !merged.capa.includes("covers.openlibrary.org/b/isbn/")
      ) {
        setCoverUrl(merged.capa);
      } else if (keepCover) {
        setCoverUrl(keepCover);
      }

      // Tags: só PT, e só se a IA trouxe poucas
      if (base.tagsCount < 3) {
        processarTags(merged.tags).forEach(addTag);
      }
      setIsbnMsg(
        `ISBN ${isbnN} · enriquecido com: ${merged.fontes.join(" + ") || "fontes"} (sem sobrescrever a IA)`,
      );
      return {
        ok: true,
        capa:
          preferKeepCover && keepCover
            ? keepCover
            : merged.capa && isPlausibleCoverUrl(merged.capa)
              ? merged.capa
              : keepCover || undefined,
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
    const capaOk =
      merged.capa &&
      isPlausibleCoverUrl(merged.capa) &&
      !merged.capa.includes("covers.openlibrary.org/b/isbn/")
        ? merged.capa
        : "";
    if (capaOk) setCoverUrl(capaOk);
    else if (opts?.keepCover) setCoverUrl(opts.keepCover);
    if (merged.paginas) setPages(String(merged.paginas));
    if (merged.peso && !weight) setWeight(String(merged.peso));
    if (merged.tipoCapa) setCoverType(merged.tipoCapa);
    processarTags(merged.tags).forEach(addTag);
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

  async function buscarIAFoto(file: File) {
    setIsbnMsg("Analisando foto da capa (IA + web)…");
    let photoDataUrl: string;
    try {
      photoDataUrl = await fileToCoverDataUrl(file);
    } catch (e) {
      setIsbnMsg(e instanceof Error ? e.message : "Falha ao processar foto");
      return;
    }
    // Foto enviada é a verdade visual até haver capa de catálogo validada
    setCoverUrl(photoDataUrl);
    const res = await fetch("/api/isbn/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: photoDataUrl, webSearch: true }),
    });
    const d = await res.json();
    if (!res.ok) {
      setIsbnMsg(d.error || "Falha na IA");
      setCoverUrl(photoDataUrl);
      return;
    }
    await applyAiResult(d, { uploadedCover: photoDataUrl });
  }

  async function applyAiResult(
    d: Record<string, unknown>,
    opts?: { uploadedCover?: string },
  ) {
    const photo = opts?.uploadedCover || "";

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

    const aiTags = processarTags([
      ...(Array.isArray(d.tags) ? d.tags.map(String) : []),
      ...(typeof d.colecao === "string" && d.colecao.trim()
        ? [d.colecao.trim()]
        : []),
    ]);
    aiTags.forEach(addTag);

    const catalogCoverRaw =
      typeof d.capa === "string" && isPlausibleCoverUrl(d.capa) ? d.capa : "";
    // Nunca usar placeholder OL /b/isbn/…; foto vence
    const catalogCover =
      catalogCoverRaw &&
      !catalogCoverRaw.includes("covers.openlibrary.org/b/isbn/")
        ? catalogCoverRaw
        : "";

    if (photo) {
      setCoverUrl(photo);
    } else if (catalogCover) {
      setCoverUrl(catalogCover);
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
      coverUrl: photo || catalogCover || "",
      tagsCount: aiTags.length,
    };

    if (isbnFound && d.isbnConfirmado === true) {
      setIsbnBusca(isbnFound);
      setIsbnMsg(`${src}${conf} — enriquecendo com fontes (sem sobrescrever)…`);
      const r = await buscarISBN(isbnFound, {
        soft: true,
        mode: "enrich",
        base: snapshot,
        keepCover: photo || catalogCover || undefined,
      });
      if (r.ok) {
        // Garante foto se catálogo não trouxe capa boa
        if (photo) setCoverUrl(photo);
        setIsbnMsg(`${src}${conf} · ficha da IA preservada · ISBN ${isbnFound}${extra}`);
        return;
      }
      setIsbn(isbnFound);
      if (photo) setCoverUrl(photo);
      setIsbnMsg(
        `${src}${conf} · ISBN ${isbnFound} registrado; fontes extras sem dados · capa da foto mantida.`,
      );
      return;
    }

    setIsbn("");
    if (!isbnFound) setIsbnBusca("");
    if (photo) setCoverUrl(photo);
    setIsbnMsg(`Preenchido por ${src}${conf}${extra}`);
  }

  async function abrirScanner() {
    setScannerOpen(true);
    await new Promise((r) => setTimeout(r, 50));
    if (!window.ZXing) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src =
          "https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Falha ao carregar ZXing"));
        document.body.appendChild(s);
      });
    }
    const reader = new window.ZXing!.BrowserMultiFormatReader();
    readerRef.current = reader;
    const devices = await reader.listVideoInputDevices();
    setCameras(devices);
    const preferred =
      devices.find((d) => /back|rear|traseira/i.test(d.label))?.deviceId ||
      devices[0]?.deviceId ||
      null;
    setCameraId(preferred || "");
    if (videoRef.current) {
      await reader.decodeFromVideoDevice(
        preferred,
        videoRef.current,
        (result) => {
          if (result) {
            const code = result.getText();
            pararScanner();
            setIsbnBusca(code);
            void buscarISBN(code);
          }
        },
      );
    }
  }

  function pararScanner() {
    try {
      readerRef.current?.reset();
    } catch {
      /* ignore */
    }
    readerRef.current = null;
    setScannerOpen(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        let capa = (coverUrl || "").trim() || null;
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
          peso: Number(weight),
          estado: condition as "Novo" | "Ótimo" | "Bom" | "Regular",
          tipoCapa: coverType as "Brochura" | "Capa Dura",
          precoCompra: purchasePrice ? Number(purchasePrice) : null,
          precoVenda: Number(salePrice),
          estoque: Number(stock),
          localizacao: location || null,
          tags,
        };
        const result = initial?.id
          ? await updateBook(initial.id, payload)
          : await createBook(payload);
        if (!result.ok) {
          setError(result.error);
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
    <div className="livros-page">
      <div className="page-header">
        <div>
          <h4>{isEdit ? "Editar Livro" : "Novo Livro"}</h4>
          <nav className="text-xs text-muted">
            <Link href="/painel/livros">Livros</Link> /{" "}
            {isEdit ? "Editar" : "Novo"}
          </nav>
        </div>
        <Link
          href="/painel/livros"
          className="rounded-md border border-line px-3 py-1.5 text-sm"
        >
          ← Voltar
        </Link>
      </div>

      <div className="card mb-4" style={{ borderLeft: "3px solid var(--accent)" }}>
        <div className="card-body">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div
              style={{
                width: 42,
                height: 42,
                background: "var(--accent-soft)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent)",
                fontWeight: 700,
              }}
            >
              ISBN
            </div>
            <div style={{ flex: 1 }}>
              <div className="text-sm font-semibold">Busca por ISBN ou título</div>
              <div className="text-xs text-muted">
                Digite ISBN ou título. Google Books, Open Library, HathiTrust,
                Mercado Livre e scraper BR
              </div>
            </div>
            <div className="flex flex-wrap gap-2" style={{ flex: "1 1 280px" }}>
              <input
                value={isbnBusca}
                onChange={(e) => setIsbnBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void buscarISBN())}
                className="form-control"
                placeholder="ISBN ou título (ex: 48 leis do poder)"
                maxLength={120}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn-accent" onClick={() => void buscarISBN()}>
                Buscar
              </button>
              <button
                type="button"
                className="rounded-md border border-line px-3 py-2 text-sm"
                onClick={() => void abrirScanner()}
                title="Câmera do computador"
              >
                📷
              </button>
            </div>
          </div>

          {showProgress ? (
            <div className="isbn-source-row mb-2">
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
            <div className="rounded-md border border-line bg-accent-soft px-3 py-2 text-sm text-accent-text">
              {isbnMsg}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 border-t border-line pt-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">
                IA · descrição / título (OpenRouter + web)
              </div>
              <div className="flex gap-2">
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
                  className="rounded-md border border-line px-3 py-2 text-sm"
                  onClick={() => void buscarIATexto()}
                >
                  IA
                </button>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">
                IA · foto da capa (visão + web → ISBN)
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="form-control"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void buscarIAFoto(f);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {scannerOpen ? (
        <div className="scanner-modal">
          <div className="scanner-dialog">
            <div className="mb-2 flex items-center justify-between">
              <strong>Escanear Código de Barras</strong>
              <button type="button" onClick={pararScanner}>
                Fechar
              </button>
            </div>
            <div id="scannerWrap">
              <video ref={videoRef} id="scannerVideo" playsInline muted />
              <div className="scanner-line" />
            </div>
            <select
              className="form-select mt-2"
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
            >
              {cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label || c.deviceId}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div>
            <div className="card mb-3">
              <div className="card-header">Dados do Livro</div>
              <div className="card-body grid gap-3 md:grid-cols-2">
                <div>
                  <label className="form-label">ISBN</label>
                  <input
                    className="form-control font-mono"
                    value={isbn}
                    onChange={(e) => setIsbn(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Localização no Sebo</label>
                  <input
                    className="form-control"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Estante A — Prateleira 3"
                  />
                </div>
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
                <div className="md:col-span-2">
                  <label className="form-label">Sinopse</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                  />
                </div>
              </div>
            </div>

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

            <div className="card">
              <div className="card-header">Preços, Estoque e Físico</div>
              <div className="card-body grid gap-3 sm:grid-cols-2 md:grid-cols-3">
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
                <div>
                  <label className="form-label">
                    Estoque <span className="required-star">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    className="form-control"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">
                    Peso <span className="required-star">*</span> (g)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="form-control"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                  <div className="form-text">
                    {weight
                      ? `≈ ${(Number(weight) / 1000).toFixed(3)} kg`
                      : ""}
                  </div>
                </div>
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
              <div className="card-header">Capa do Livro</div>
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
                    <small>Carregada pelo ISBN</small>
                  </div>
                )}
                <label className="form-label w-full text-start">URL da Capa</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://… ou foto da IA"
                />
                <div className="form-text text-start">
                  Catálogo (Google/OL) tem prioridade; se não achar, usa a foto
                  enviada.
                </div>
                {isEdit ? (
                  <button
                    type="button"
                    className="mt-2 w-full rounded-md border border-line px-3 py-2 text-sm"
                    onClick={() => void buscarISBN(isbn)}
                  >
                    Recarregar pelo ISBN
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button type="submit" className="btn-accent px-4" disabled={pending}>
            {pending
              ? "Salvando…"
              : isEdit
                ? "Salvar Alterações"
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
  );
}
